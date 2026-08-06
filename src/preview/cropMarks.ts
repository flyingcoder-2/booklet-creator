import type { Rect } from '../imposition/geometry'

export interface LineSegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

const MARK_LENGTH = 18
const MARK_OFFSET = 6

/**
 * Corner trim marks plus a center fold mark, positioned outside the trim
 * area (export spec "Optional crop marks"). `pageRects` gives the trim
 * boundary (the union of the two nominal, non-bleed page rects); marks are
 * drawn `MARK_OFFSET` outside it, so they need `bleed >= MARK_OFFSET +
 * MARK_LENGTH` (or an export-time margin) to avoid being clipped at the
 * sheet edge -- true whether or not bleed is enabled is a Phase 9 concern.
 */
export function cropMarkLines(pageRects: {
  left: Rect
  right: Rect
}): LineSegment[] {
  const trimLeft = pageRects.left.x
  const trimRight = pageRects.right.x + pageRects.right.width
  const trimBottom = pageRects.left.y
  const trimTop = pageRects.left.y + pageRects.left.height
  const foldX = pageRects.left.x + pageRects.left.width

  const lines: LineSegment[] = []
  const corners: { x: number; y: number; dx: 1 | -1; dy: 1 | -1 }[] = [
    { x: trimLeft, y: trimBottom, dx: -1, dy: -1 },
    { x: trimRight, y: trimBottom, dx: 1, dy: -1 },
    { x: trimLeft, y: trimTop, dx: -1, dy: 1 },
    { x: trimRight, y: trimTop, dx: 1, dy: 1 },
  ]

  for (const c of corners) {
    lines.push({
      x1: c.x,
      y1: c.y + c.dy * MARK_OFFSET,
      x2: c.x,
      y2: c.y + c.dy * (MARK_OFFSET + MARK_LENGTH),
    })
    lines.push({
      x1: c.x + c.dx * MARK_OFFSET,
      y1: c.y,
      x2: c.x + c.dx * (MARK_OFFSET + MARK_LENGTH),
      y2: c.y,
    })
  }

  lines.push({
    x1: foldX,
    y1: trimTop + MARK_OFFSET,
    x2: foldX,
    y2: trimTop + MARK_OFFSET + MARK_LENGTH,
  })
  lines.push({
    x1: foldX,
    y1: trimBottom - MARK_OFFSET,
    x2: foldX,
    y2: trimBottom - MARK_OFFSET - MARK_LENGTH,
  })

  return lines
}
