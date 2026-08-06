import type { Patch } from 'immer'

interface HistoryEntry {
  patches: Patch[]
  inversePatches: Patch[]
}

/**
 * Bounded ring buffer of Immer patch pairs (design.md D7). Only patches are
 * kept — never whole-state snapshots or asset bytes — so history size stays
 * proportional to the number of edits, not to project size.
 */
export class UndoStack {
  private undoEntries: HistoryEntry[] = []
  private redoEntries: HistoryEntry[] = []
  private readonly maxEntries: number

  constructor(maxEntries: number = 100) {
    this.maxEntries = maxEntries
  }

  /** Records a committed mutation. Always clears the redo stack. */
  push(patches: Patch[], inversePatches: Patch[]): void {
    this.undoEntries.push({ patches, inversePatches })
    if (this.undoEntries.length > this.maxEntries) {
      this.undoEntries.shift()
    }
    this.redoEntries = []
  }

  canUndo(): boolean {
    return this.undoEntries.length > 0
  }

  canRedo(): boolean {
    return this.redoEntries.length > 0
  }

  /** Pops the most recent entry and returns the patches to apply to undo it. */
  undo(): Patch[] | undefined {
    const entry = this.undoEntries.pop()
    if (!entry) return undefined
    this.redoEntries.push(entry)
    return entry.inversePatches
  }

  /** Pops the most recently undone entry and returns the patches to reapply it. */
  redo(): Patch[] | undefined {
    const entry = this.redoEntries.pop()
    if (!entry) return undefined
    this.undoEntries.push(entry)
    if (this.undoEntries.length > this.maxEntries) {
      this.undoEntries.shift()
    }
    return entry.patches
  }

  get undoDepth(): number {
    return this.undoEntries.length
  }

  get redoDepth(): number {
    return this.redoEntries.length
  }

  clear(): void {
    this.undoEntries = []
    this.redoEntries = []
  }
}
