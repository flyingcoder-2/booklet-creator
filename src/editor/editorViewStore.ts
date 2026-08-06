import { create } from 'zustand'

/**
 * View-only editor state — never persisted, never part of the `Project`
 * model. Overlay toggles persist across page navigation within a session
 * (page-editor spec "Toggle grid ... remains hidden when navigating between
 * pages") simply by living here rather than per-page.
 */
export interface EditorViewState {
  showMargins: boolean
  showSafeArea: boolean
  showCenterGuides: boolean
  showGrid: boolean
  snapEnabled: boolean
  aspectLocked: boolean
  zoom: number
  cropModeObjectId: string | null

  toggleMargins: () => void
  toggleSafeArea: () => void
  toggleCenterGuides: () => void
  toggleGrid: () => void
  setSnapEnabled: (enabled: boolean) => void
  setAspectLocked: (locked: boolean) => void
  setZoom: (zoom: number) => void
  setCropModeObjectId: (objectId: string | null) => void
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4

export const useEditorViewStore = create<EditorViewState>((set) => ({
  showMargins: true,
  showSafeArea: true,
  showCenterGuides: true,
  showGrid: false,
  snapEnabled: true,
  aspectLocked: true,
  zoom: 1,
  cropModeObjectId: null,

  toggleMargins: () => set((s) => ({ showMargins: !s.showMargins })),
  toggleSafeArea: () => set((s) => ({ showSafeArea: !s.showSafeArea })),
  toggleCenterGuides: () =>
    set((s) => ({ showCenterGuides: !s.showCenterGuides })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  setSnapEnabled: (enabled) => set({ snapEnabled: enabled }),
  setAspectLocked: (locked) => set({ aspectLocked: locked }),
  setZoom: (zoom) =>
    set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
  setCropModeObjectId: (objectId) => set({ cropModeObjectId: objectId }),
}))
