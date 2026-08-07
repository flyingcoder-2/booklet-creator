import { applyPatches, enablePatches, produceWithPatches } from 'immer'
import { create } from 'zustand'
import { deleteAssetBytes } from '../assets/assetStore'
import { padCount } from '../imposition/impose'
import { generateId } from '../model/ids'
import type {
  AssetId,
  AssetMeta,
  ImageObject,
  ObjectId,
  Page,
  PageId,
  Project,
} from '../model/types'
import { CURRENT_PROJECT_FORMAT_VERSION } from '../model/types'
import { releaseAsset, retainAsset } from './assetRefcount'
import { UndoStack } from './undoStack'

enablePatches()

const UNDO_HISTORY_LIMIT = 100

export function createEmptyPage(): Page {
  return { id: generateId(), objectOrder: [] }
}

export function createEmptyProject(): Project {
  const page = createEmptyPage()
  return {
    formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
    settings: {
      paperSize: 'letter',
      margins: { top: 24, right: 24, bottom: 24, left: 24 },
      bleed: 0,
      cropMarks: false,
      flipMode: 'vertical-axis',
    },
    pageOrder: [page.id],
    pages: { [page.id]: page },
    objects: {},
    assets: {},
    activePageId: page.id,
  }
}

/** One new page carrying a single already-stored image, for batch creation. */
export interface NewPageWithImage {
  assetId: AssetId
  assetMeta: Omit<AssetMeta, 'id' | 'refCount'>
  placement: Omit<ImageObject, 'id' | 'assetId'>
}

export interface ProjectStore {
  project: Project
  canUndo: boolean
  canRedo: boolean

  setActivePage: (pageId: PageId) => void
  updateSettings: (patch: Partial<Project['settings']>) => void

  addPage: () => PageId
  addPagesWithImages: (entries: NewPageWithImage[]) => PageId[]
  deletePage: (pageId: PageId) => void
  duplicatePage: (pageId: PageId) => PageId
  reorderPages: (pageOrder: PageId[]) => void

  addObject: (
    pageId: PageId,
    assetId: string,
    assetMeta: Omit<AssetMeta, 'id' | 'refCount'>,
    placement: Omit<ImageObject, 'id' | 'assetId'>,
  ) => ObjectId
  updateObject: (
    objectId: ObjectId,
    patch: Partial<Omit<ImageObject, 'id'>>,
  ) => void
  removeObject: (pageId: PageId, objectId: ObjectId) => void
  reorderObjects: (pageId: PageId, objectOrder: ObjectId[]) => void

  undo: () => void
  redo: () => void

  paddedPageCount: () => number
  sheetCount: () => number
}

const undoStack = new UndoStack(UNDO_HISTORY_LIMIT)

/** Releases one reference to `objectId`'s asset, appending its id to `onZero` if this drops it to zero. */
function releaseObjectAsset(
  project: Project,
  objectId: ObjectId,
  onZero: AssetId[],
): void {
  const object = project.objects[objectId]
  if (!object) return
  const result = releaseAsset(project.assets, object.assetId)
  project.assets = result.assets
  if (result.deleted) onZero.push(object.assetId)
}

/** Fire-and-forget IndexedDB byte cleanup for assets that just hit zero references. */
function cleanUpDeletedAssets(assetIds: AssetId[]): void {
  for (const assetId of assetIds) {
    void deleteAssetBytes(assetId).catch(() => {
      // Best-effort: a failed delete leaves an orphaned blob, not a correctness bug.
    })
  }
}

export const useProjectStore = create<ProjectStore>((set, get) => {
  /** Applies an Immer recipe, records the inverse patches, and clears redo. */
  function mutate(recipe: (draft: Project) => void) {
    const [nextProject, patches, inversePatches] = produceWithPatches(
      get().project,
      recipe,
    )
    if (patches.length === 0) return
    undoStack.push(patches, inversePatches)
    set({
      project: nextProject,
      canUndo: undoStack.canUndo(),
      canRedo: undoStack.canRedo(),
    })
  }

  return {
    project: createEmptyProject(),
    canUndo: false,
    canRedo: false,

    // Deliberately bypasses `mutate()`: which page is being viewed is not an
    // edit, and must not consume undo history or make Undo appear to do
    // nothing (or worse, revert navigation instead of the last real edit).
    setActivePage: (pageId) => {
      if (!get().project.pages[pageId]) return
      set((state) => ({ project: { ...state.project, activePageId: pageId } }))
    },

    updateSettings: (patch) =>
      mutate((draft) => {
        Object.assign(draft.settings, patch)
      }),

    addPage: () => {
      const page = createEmptyPage()
      mutate((draft) => {
        draft.pages[page.id] = page
        draft.pageOrder.push(page.id)
        draft.activePageId = page.id
      })
      return page.id
    },

    // Appends N pages in one mutation, so a whole PDF import is a single undo
    // step rather than N of them, and the sidebar re-renders once (design.md D4).
    addPagesWithImages: (entries) => {
      if (entries.length === 0) return []

      const created = entries.map((entry) => ({
        entry,
        pageId: generateId(),
        objectId: generateId(),
      }))

      mutate((draft) => {
        for (const { entry, pageId, objectId } of created) {
          draft.assets = retainAsset(
            draft.assets,
            entry.assetId,
            entry.assetMeta,
          )
          draft.objects[objectId] = {
            id: objectId,
            assetId: entry.assetId,
            ...entry.placement,
          }
          draft.pages[pageId] = { id: pageId, objectOrder: [objectId] }
          draft.pageOrder.push(pageId)
        }
        draft.activePageId = created[0].pageId
      })

      return created.map((c) => c.pageId)
    },

    deletePage: (pageId) => {
      const releasedAssets: AssetId[] = []
      mutate((draft) => {
        if (draft.pageOrder.length <= 1) return
        const page = draft.pages[pageId]
        if (!page) return

        for (const objectId of page.objectOrder) {
          releaseObjectAsset(draft, objectId, releasedAssets)
          delete draft.objects[objectId]
        }

        const index = draft.pageOrder.indexOf(pageId)
        draft.pageOrder.splice(index, 1)
        delete draft.pages[pageId]

        if (draft.activePageId === pageId) {
          const neighborIndex = Math.min(index, draft.pageOrder.length - 1)
          draft.activePageId = draft.pageOrder[neighborIndex]
        }
      })
      cleanUpDeletedAssets(releasedAssets)
    },

    duplicatePage: (pageId) => {
      const newPageId = generateId()
      mutate((draft) => {
        const source = draft.pages[pageId]
        if (!source) return

        const newObjectOrder: ObjectId[] = []
        for (const objectId of source.objectOrder) {
          const sourceObject = draft.objects[objectId]
          const copyId = generateId()
          draft.objects[copyId] = { ...sourceObject, id: copyId }
          newObjectOrder.push(copyId)
          // The asset is already registered (the source object references
          // it), so this call only needs to increment its refCount.
          draft.assets = retainAsset(
            draft.assets,
            sourceObject.assetId,
            draft.assets[sourceObject.assetId],
          )
        }

        draft.pages[newPageId] = { id: newPageId, objectOrder: newObjectOrder }
        const index = draft.pageOrder.indexOf(pageId)
        draft.pageOrder.splice(index + 1, 0, newPageId)
        draft.activePageId = newPageId
      })
      return newPageId
    },

    reorderPages: (pageOrder) =>
      mutate((draft) => {
        draft.pageOrder = pageOrder
      }),

    addObject: (pageId, assetId, assetMeta, placement) => {
      const objectId = generateId()
      mutate((draft) => {
        const page = draft.pages[pageId]
        if (!page) return
        draft.assets = retainAsset(draft.assets, assetId, assetMeta)
        draft.objects[objectId] = { id: objectId, assetId, ...placement }
        page.objectOrder.push(objectId)
      })
      return objectId
    },

    updateObject: (objectId, patch) =>
      mutate((draft) => {
        const object = draft.objects[objectId]
        if (!object) return
        Object.assign(object, patch)
      }),

    removeObject: (pageId, objectId) => {
      const releasedAssets: AssetId[] = []
      mutate((draft) => {
        const page = draft.pages[pageId]
        if (!page) return
        releaseObjectAsset(draft, objectId, releasedAssets)
        delete draft.objects[objectId]
        page.objectOrder = page.objectOrder.filter((id) => id !== objectId)
      })
      cleanUpDeletedAssets(releasedAssets)
    },

    reorderObjects: (pageId, objectOrder) =>
      mutate((draft) => {
        const page = draft.pages[pageId]
        if (page) page.objectOrder = objectOrder
      }),

    undo: () => {
      const inversePatches = undoStack.undo()
      if (!inversePatches) return
      const nextProject = applyPatches(get().project, inversePatches)
      set({
        project: nextProject,
        canUndo: undoStack.canUndo(),
        canRedo: undoStack.canRedo(),
      })
    },

    redo: () => {
      const patches = undoStack.redo()
      if (!patches) return
      const nextProject = applyPatches(get().project, patches)
      set({
        project: nextProject,
        canUndo: undoStack.canUndo(),
        canRedo: undoStack.canRedo(),
      })
    },

    paddedPageCount: () => padCount(get().project.pageOrder.length),
    sheetCount: () => padCount(get().project.pageOrder.length) / 4,
  }
})

/** Resets the store to a fresh project (e.g. after Open Project) and clears undo/redo history. */
export function resetProjectStore(
  project: Project = createEmptyProject(),
): void {
  undoStack.clear()
  useProjectStore.setState({ project, canUndo: false, canRedo: false })
}
