import type { Project } from '../model/types'
import { useProjectStore } from '../store/projectStore'
import {
  saveProjectSnapshot,
  StorageQuotaExceededError,
  StorageUnavailableError,
} from './projectSnapshotStore'
import { useStorageStatusStore } from './storageStatusStore'

const AUTOSAVE_DEBOUNCE_MS = 800

let debounceHandle: ReturnType<typeof setTimeout> | undefined
let unsubscribe: (() => void) | undefined

async function persist(project: Project): Promise<void> {
  try {
    await saveProjectSnapshot(project)
    useStorageStatusStore.getState().setLastSaveFailed(false)
  } catch (err) {
    useStorageStatusStore.getState().setLastSaveFailed(true)
    if (err instanceof StorageQuotaExceededError) {
      useStorageStatusStore.getState().setQuotaExceeded(true)
    } else if (err instanceof StorageUnavailableError) {
      useStorageStatusStore.getState().setStorageUnavailable(true)
    }
    // Autosave failures never discard in-memory work (persistence spec) --
    // the project stays exactly as it is in the store either way.
  }
}

/**
 * Debounced autosave (design.md, persistence spec "debounced autosave"):
 * subscribes to the project store and writes a snapshot `AUTOSAVE_DEBOUNCE_MS`
 * after the last change, so a continuous drag or rapid edits produce one
 * write, not one per frame. Call `stopAutosave` to tear down (mainly for
 * tests).
 */
export function startAutosave(): void {
  if (unsubscribe) return // already running

  unsubscribe = useProjectStore.subscribe((state) => {
    if (debounceHandle) clearTimeout(debounceHandle)
    debounceHandle = setTimeout(() => {
      void persist(state.project)
    }, AUTOSAVE_DEBOUNCE_MS)
  })
}

export function stopAutosave(): void {
  if (debounceHandle) clearTimeout(debounceHandle)
  debounceHandle = undefined
  unsubscribe?.()
  unsubscribe = undefined
}

/** Forces an immediate save, bypassing the debounce (e.g. before the tab unloads). */
export async function flushAutosave(): Promise<void> {
  if (debounceHandle) {
    clearTimeout(debounceHandle)
    debounceHandle = undefined
  }
  await persist(useProjectStore.getState().project)
}
