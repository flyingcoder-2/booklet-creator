import { beforeEach, describe, expect, it } from 'vitest'
import { resetProjectStore, useProjectStore } from './projectStore'

const ASSET_META = {
  width: 100,
  height: 100,
  mimeType: 'image/png' as const,
  byteLength: 10,
}
const PLACEMENT = {
  x: 0.5,
  y: 0.5,
  width: 0.5,
  height: 0.5,
  rotationDegrees: 0,
  flipX: false,
  flipY: false,
  opacity: 1,
}

beforeEach(() => {
  resetProjectStore()
})

describe('initial project', () => {
  it('starts with exactly one empty page, which is active', () => {
    const { project } = useProjectStore.getState()
    expect(project.pageOrder).toHaveLength(1)
    expect(project.activePageId).toBe(project.pageOrder[0])
    expect(project.pages[project.activePageId].objectOrder).toEqual([])
  })
})

describe('page actions', () => {
  it('addPage appends a page and makes it active', () => {
    const { addPage } = useProjectStore.getState()
    const newPageId = addPage()
    const { project } = useProjectStore.getState()
    expect(project.pageOrder).toHaveLength(2)
    expect(project.pageOrder[1]).toBe(newPageId)
    expect(project.activePageId).toBe(newPageId)
  })

  it('deletePage removes the page and moves selection to a neighbour', () => {
    const { addPage, deletePage } = useProjectStore.getState()
    const page2 = addPage()
    const page3 = useProjectStore.getState().addPage()
    deletePage(page2)

    const { project } = useProjectStore.getState()
    expect(project.pageOrder).toHaveLength(2)
    expect(project.pages[page2]).toBeUndefined()
    expect(project.activePageId).toBe(page3)
  })

  it('refuses to delete the last remaining page', () => {
    const onlyPageId = useProjectStore.getState().project.pageOrder[0]
    useProjectStore.getState().deletePage(onlyPageId)
    expect(useProjectStore.getState().project.pageOrder).toHaveLength(1)
  })

  it('duplicatePage inserts an independent copy immediately after the source, sharing assets', () => {
    const pageId = useProjectStore.getState().project.pageOrder[0]
    const { addObject, duplicatePage } = useProjectStore.getState()
    addObject(pageId, 'asset-1', ASSET_META, PLACEMENT)

    const copyId = duplicatePage(pageId)
    const { project } = useProjectStore.getState()

    expect(project.pageOrder).toEqual([pageId, copyId])
    expect(project.assets['asset-1'].refCount).toBe(2)

    const originalObjectId = project.pages[pageId].objectOrder[0]
    const copyObjectId = project.pages[copyId].objectOrder[0]
    expect(copyObjectId).not.toBe(originalObjectId)
    expect(project.objects[copyObjectId].assetId).toBe('asset-1')

    // Editing the copy does not affect the original.
    useProjectStore.getState().updateObject(copyObjectId, { opacity: 0.2 })
    expect(
      useProjectStore.getState().project.objects[originalObjectId].opacity,
    ).toBe(1)
  })

  it('reorderPages sets the new page order', () => {
    const { addPage, reorderPages } = useProjectStore.getState()
    const page1 = useProjectStore.getState().project.pageOrder[0]
    const page2 = addPage()
    reorderPages([page2, page1])
    expect(useProjectStore.getState().project.pageOrder).toEqual([page2, page1])
  })
})

describe('object actions and asset refcounting', () => {
  it('addObject registers the asset and appends the object to the page layer order', () => {
    const pageId = useProjectStore.getState().project.pageOrder[0]
    const objectId = useProjectStore
      .getState()
      .addObject(pageId, 'asset-1', ASSET_META, PLACEMENT)

    const { project } = useProjectStore.getState()
    expect(project.pages[pageId].objectOrder).toEqual([objectId])
    expect(project.objects[objectId].assetId).toBe('asset-1')
    expect(project.assets['asset-1']).toEqual({
      id: 'asset-1',
      refCount: 1,
      ...ASSET_META,
    })
  })

  it('removeObject releases the asset and deletes it at zero references', () => {
    const pageId = useProjectStore.getState().project.pageOrder[0]
    const { addObject, removeObject } = useProjectStore.getState()
    const objectId = addObject(pageId, 'asset-1', ASSET_META, PLACEMENT)

    expect(useProjectStore.getState().project.assets['asset-1'].refCount).toBe(
      1,
    )

    removeObject(pageId, objectId)
    const { project } = useProjectStore.getState()
    expect(project.objects[objectId]).toBeUndefined()
    expect(project.assets['asset-1']).toBeUndefined()
    expect(project.pages[pageId].objectOrder).toEqual([])
  })

  it('reorderObjects changes the layer order', () => {
    const pageId = useProjectStore.getState().project.pageOrder[0]
    const { addObject, reorderObjects } = useProjectStore.getState()
    const a = addObject(pageId, 'asset-1', ASSET_META, PLACEMENT)
    const b = useProjectStore
      .getState()
      .addObject(pageId, 'asset-2', ASSET_META, PLACEMENT)

    reorderObjects(pageId, [b, a])
    expect(
      useProjectStore.getState().project.pages[pageId].objectOrder,
    ).toEqual([b, a])
  })
})

describe('selectors', () => {
  it('paddedPageCount and sheetCount reflect the current real page count', () => {
    const { addPage, paddedPageCount, sheetCount } = useProjectStore.getState()
    addPage()
    addPage() // now 3 real pages
    expect(paddedPageCount()).toBe(4)
    expect(sheetCount()).toBe(1)
  })
})

describe('undo/redo', () => {
  it('setActivePage does not consume undo history (navigation is not an edit)', () => {
    const { addPage, addObject, setActivePage, undo } =
      useProjectStore.getState()
    const page1 = useProjectStore.getState().project.pageOrder[0]
    const objectId = addObject(page1, 'asset-1', ASSET_META, PLACEMENT)
    const page2 = addPage()

    // Navigate back and forth -- this must not itself become undo-able.
    setActivePage(page1)
    setActivePage(page2)
    setActivePage(page1)

    expect(useProjectStore.getState().project.activePageId).toBe(page1)
    undo() // should undo addPage, not any of the setActivePage calls
    const { project } = useProjectStore.getState()
    expect(project.pageOrder).toEqual([page1])
    expect(project.pages[page1].objectOrder).toEqual([objectId]) // addObject still intact
  })

  it('undo reverts the most recent mutation', () => {
    const pageId = useProjectStore.getState().project.pageOrder[0]
    useProjectStore
      .getState()
      .addObject(pageId, 'asset-1', ASSET_META, PLACEMENT)
    expect(
      useProjectStore.getState().project.pages[pageId].objectOrder,
    ).toHaveLength(1)

    useProjectStore.getState().undo()
    expect(
      useProjectStore.getState().project.pages[pageId].objectOrder,
    ).toHaveLength(0)
  })

  it('redo reapplies an undone mutation', () => {
    const pageId = useProjectStore.getState().project.pageOrder[0]
    const objectId = useProjectStore
      .getState()
      .addObject(pageId, 'asset-1', ASSET_META, PLACEMENT)

    useProjectStore.getState().undo()
    useProjectStore.getState().redo()

    expect(
      useProjectStore.getState().project.pages[pageId].objectOrder,
    ).toEqual([objectId])
  })

  it('redo is invalidated by a new mutation after undo', () => {
    const pageId = useProjectStore.getState().project.pageOrder[0]
    useProjectStore
      .getState()
      .addObject(pageId, 'asset-1', ASSET_META, PLACEMENT)
    useProjectStore.getState().undo()

    useProjectStore
      .getState()
      .addObject(pageId, 'asset-2', ASSET_META, PLACEMENT)
    expect(useProjectStore.getState().canRedo).toBe(false)

    useProjectStore.getState().redo() // no-op
    expect(
      useProjectStore.getState().project.pages[pageId].objectOrder,
    ).toHaveLength(1)
    expect(
      useProjectStore.getState().project.pages[pageId].objectOrder[0],
    ).not.toBe(undefined)
  })

  it('undo a page deletion restores the page and its content at its original index', () => {
    const { addPage, addObject, deletePage, undo } = useProjectStore.getState()
    const page1 = useProjectStore.getState().project.pageOrder[0]
    addObject(page1, 'asset-1', ASSET_META, PLACEMENT)
    const page2 = addPage()

    deletePage(page1)
    expect(useProjectStore.getState().project.pageOrder).toEqual([page2])

    undo()
    const { project } = useProjectStore.getState()
    expect(project.pageOrder).toEqual([page1, page2])
    expect(project.pages[page1].objectOrder).toHaveLength(1)
  })

  it('history is bounded: undoing past the limit stops responding rather than growing unbounded', () => {
    const pageId = useProjectStore.getState().project.pageOrder[0]
    const limit = 100

    for (let i = 0; i < limit + 20; i++) {
      useProjectStore
        .getState()
        .addObject(pageId, `asset-${i}`, ASSET_META, PLACEMENT)
    }

    let undoCount = 0
    while (useProjectStore.getState().canUndo && undoCount < 1000) {
      useProjectStore.getState().undo()
      undoCount++
    }

    expect(undoCount).toBe(limit)
  })
})
