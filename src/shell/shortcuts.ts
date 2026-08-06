export type ShortcutAction =
  'undo' | 'redo' | 'duplicatePage' | 'nextPage' | 'prevPage'

export interface ShortcutKeyEvent {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

/**
 * Pure key-combo -> action mapping (page-editor spec "keyboard shortcuts for
 * undo, redo, delete, duplicate page, and page navigation" -- delete itself
 * is handled per-object inside `PageEditor`, since it needs an active
 * selection; this covers the app-level shortcuts).
 */
export function matchShortcut(e: ShortcutKeyEvent): ShortcutAction | null {
  const mod = e.ctrlKey || e.metaKey

  if (!mod) {
    if (e.key === 'PageDown') return 'nextPage'
    if (e.key === 'PageUp') return 'prevPage'
    return null
  }

  const key = e.key.toLowerCase()
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo'
  if (key === 'y') return 'redo'
  if (key === 'd') return 'duplicatePage'
  return null
}
