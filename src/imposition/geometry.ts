/** All linear measurements in this module are in PDF points (1/72 inch). */

export type PaperSize = 'letter' | 'a4' | 'legal'

export interface Size {
  width: number
  height: number
}

const MM_PER_POINT = 25.4 / 72

function mm(points: number): number {
  return points * MM_PER_POINT
}

function fromMm(millimeters: number): number {
  return millimeters / MM_PER_POINT
}

/**
 * Landscape physical sheet size per paper size, in points. Each sheet holds two
 * portrait booklet pages side by side (see `bookletPageSize`).
 */
export const SHEET_SIZES: Record<PaperSize, Size> = {
  letter: { width: 792, height: 612 }, // 11in x 8.5in
  a4: { width: fromMm(297), height: fromMm(210) },
  legal: { width: 1008, height: 612 }, // 14in x 8.5in
}

/** The portrait booklet-page size for a paper size: half the sheet width, full sheet height. */
export function bookletPageSize(paperSize: PaperSize): Size {
  const sheet = SHEET_SIZES[paperSize]
  return { width: sheet.width / 2, height: sheet.height }
}

/** Sheet size enlarged by bleed on every outer edge (never on the center fold). */
export function sheetSizeWithBleed(paperSize: PaperSize, bleed: number): Size {
  const sheet = SHEET_SIZES[paperSize]
  return { width: sheet.width + 2 * bleed, height: sheet.height + 2 * bleed }
}

export interface Margins {
  top: number
  right: number
  bottom: number
  left: number
}

export function uniformMargins(value: number): Margins {
  return { top: value, right: value, bottom: value, left: value }
}

/** A slot is one half (left or right) of one side of one physical sheet. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The two booklet-page rects (left slot, right slot) within a landscape sheet,
 * in the sheet's own coordinate space (origin at the bleed-enlarged sheet's
 * bottom-left, so these already account for bleed). Each rect is exactly the
 * *nominal* (non-bleed) page size — the coordinate space a booklet page's
 * normalized 0..1 object positions map onto, matching what the editor shows.
 * Bleed is outer-edge-only (design.md D9/export spec): centered between the
 * two slots is the fold, which these rects touch directly with no inset, so
 * content is never clipped or extended there.
 */
export function pageRects(
  paperSize: PaperSize,
  bleed: number,
): { left: Rect; right: Rect } {
  const sheet = SHEET_SIZES[paperSize]
  const halfWidth = sheet.width / 2
  return {
    left: { x: bleed, y: bleed, width: halfWidth, height: sheet.height },
    right: {
      x: bleed + halfWidth,
      y: bleed,
      width: halfWidth,
      height: sheet.height,
    },
  }
}

/**
 * The print-safe clip rect for each slot: `pageRects` inset by `margins` on
 * every edge, including the fold (each slot uses its own left/right margin
 * for the fold-side inset, same as its outer-side inset, since `margins` is
 * defined from each booklet page's own point of view). Content outside this
 * rect is clipped at export (export spec "Print-safe margins").
 */
export function slotRects(
  paperSize: PaperSize,
  margins: Margins,
  bleed: number,
): { left: Rect; right: Rect } {
  const page = pageRects(paperSize, bleed)

  function inset(rect: Rect): Rect {
    return {
      x: rect.x + margins.left,
      y: rect.y + margins.bottom,
      width: rect.width - margins.left - margins.right,
      height: rect.height - margins.top - margins.bottom,
    }
  }

  return { left: inset(page.left), right: inset(page.right) }
}

/** Which axis the printer flips the sheet about when duplexing a landscape sheet. */
export type FlipMode = 'vertical-axis' | 'horizontal-axis'

export { mm }
