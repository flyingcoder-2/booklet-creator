import { describe, expect, it } from 'vitest'
import { matchShortcut } from './shortcuts'

function key(
  k: string,
  mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {},
) {
  return { key: k, ctrlKey: false, metaKey: false, shiftKey: false, ...mods }
}

describe('matchShortcut', () => {
  it('Ctrl+Z is undo', () => {
    expect(matchShortcut(key('z', { ctrlKey: true }))).toBe('undo')
  })

  it('Cmd+Z is undo (mac)', () => {
    expect(matchShortcut(key('z', { metaKey: true }))).toBe('undo')
  })

  it('Ctrl+Shift+Z is redo', () => {
    expect(matchShortcut(key('z', { ctrlKey: true, shiftKey: true }))).toBe(
      'redo',
    )
  })

  it('Ctrl+Y is redo', () => {
    expect(matchShortcut(key('y', { ctrlKey: true }))).toBe('redo')
  })

  it('Ctrl+D is duplicate page', () => {
    expect(matchShortcut(key('d', { ctrlKey: true }))).toBe('duplicatePage')
  })

  it('PageDown with no modifier navigates to the next page', () => {
    expect(matchShortcut(key('PageDown'))).toBe('nextPage')
  })

  it('PageUp with no modifier navigates to the previous page', () => {
    expect(matchShortcut(key('PageUp'))).toBe('prevPage')
  })

  it('plain z with no modifier is not a shortcut', () => {
    expect(matchShortcut(key('z'))).toBeNull()
  })

  it('an unrelated key with a modifier is not a shortcut', () => {
    expect(matchShortcut(key('a', { ctrlKey: true }))).toBeNull()
  })
})
