import { create } from 'zustand'

/** Session-wide, non-persisted storage health flags surfaced to the UI. */
export interface StorageStatusState {
  quotaExceeded: boolean
  storageUnavailable: boolean
  lastSaveFailed: boolean
  setQuotaExceeded: (value: boolean) => void
  setStorageUnavailable: (value: boolean) => void
  setLastSaveFailed: (value: boolean) => void
}

export const useStorageStatusStore = create<StorageStatusState>((set) => ({
  quotaExceeded: false,
  storageUnavailable: false,
  lastSaveFailed: false,
  setQuotaExceeded: (value) => set({ quotaExceeded: value }),
  setStorageUnavailable: (value) => set({ storageUnavailable: value }),
  setLastSaveFailed: (value) => set({ lastSaveFailed: value }),
}))
