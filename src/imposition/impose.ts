import type { FlipMode } from './geometry'

/** Returns the smallest multiple of four that is >= realPages. */
export function padCount(realPages: number): number {
  return Math.ceil(realPages / 4) * 4
}

export interface SheetSide {
  left: number
  right: number
}

export interface Sheet {
  front: SheetSide
  back: SheetSide
}

/**
 * Maps a padded page count `N` (a multiple of four) onto physical sheets. For
 * zero-indexed sheet `s`: front is `[N - 2s, 2s + 1]`, back is `[2s + 2, N - 2s - 1]`.
 * The alternate flip mode swaps the left/right slots of every back side only.
 */
export function impose(
  N: number,
  flipMode: FlipMode = 'vertical-axis',
): Sheet[] {
  if (N <= 0 || N % 4 !== 0) {
    throw new Error(`impose: N must be a positive multiple of four, got ${N}`)
  }

  const sheetCount = N / 4
  const sheets: Sheet[] = []

  for (let s = 0; s < sheetCount; s++) {
    const front: SheetSide = { left: N - 2 * s, right: 2 * s + 1 }
    let back: SheetSide = { left: 2 * s + 2, right: N - 2 * s - 1 }

    if (flipMode === 'horizontal-axis') {
      back = { left: back.right, right: back.left }
    }

    sheets.push({ front, back })
  }

  return sheets
}

export interface OutputSide {
  sheetIndex: number
  side: 'front' | 'back'
  slots: SheetSide
}

/** Flattens sheets into output order: sheet 1 front, sheet 1 back, sheet 2 front, ... */
export function sidesInOutputOrder(sheets: Sheet[]): OutputSide[] {
  const sides: OutputSide[] = []
  sheets.forEach((sheet, sheetIndex) => {
    sides.push({ sheetIndex, side: 'front', slots: sheet.front })
    sides.push({ sheetIndex, side: 'back', slots: sheet.back })
  })
  return sides
}
