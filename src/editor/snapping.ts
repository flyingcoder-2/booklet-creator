import type { Margins } from '../imposition/geometry'
import type { PixelRect, PixelSize } from '../render/placement'

/** A candidate line to snap to, tagged so the UI can label/style it if desired. */
export interface SnapCandidate {
  position: number
  kind: 'page-edge' | 'page-center' | 'margin' | 'object-edge' | 'object-center'
}

export function collectSnapCandidatesX(
  pageSizePx: PixelSize,
  marginsPx: Margins,
  otherRects: PixelRect[],
): SnapCandidate[] {
  const candidates: SnapCandidate[] = [
    { position: 0, kind: 'page-edge' },
    { position: pageSizePx.width, kind: 'page-edge' },
    { position: pageSizePx.width / 2, kind: 'page-center' },
    { position: marginsPx.left, kind: 'margin' },
    { position: pageSizePx.width - marginsPx.right, kind: 'margin' },
  ]
  for (const rect of otherRects) {
    candidates.push(
      { position: rect.x, kind: 'object-edge' },
      { position: rect.x + rect.width, kind: 'object-edge' },
      { position: rect.x + rect.width / 2, kind: 'object-center' },
    )
  }
  return candidates
}

export function collectSnapCandidatesY(
  pageSizePx: PixelSize,
  marginsPx: Margins,
  otherRects: PixelRect[],
): SnapCandidate[] {
  const candidates: SnapCandidate[] = [
    { position: 0, kind: 'page-edge' },
    { position: pageSizePx.height, kind: 'page-edge' },
    { position: pageSizePx.height / 2, kind: 'page-center' },
    { position: marginsPx.top, kind: 'margin' },
    { position: pageSizePx.height - marginsPx.bottom, kind: 'margin' },
  ]
  for (const rect of otherRects) {
    candidates.push(
      { position: rect.y, kind: 'object-edge' },
      { position: rect.y + rect.height, kind: 'object-edge' },
      { position: rect.y + rect.height / 2, kind: 'object-center' },
    )
  }
  return candidates
}

export interface SnapAxisResult {
  offset: number
  activeLine?: number
}

/**
 * Finds the smallest adjustment (if any, within `threshold`) that aligns one
 * of `edges` (the moving rect's own left/center/right or top/center/bottom,
 * relative to its current position) to the nearest candidate.
 */
function snapAxis(
  edges: number[],
  candidates: SnapCandidate[],
  threshold: number,
): SnapAxisResult {
  let best: { delta: number; line: number } | undefined

  for (const edge of edges) {
    for (const candidate of candidates) {
      const delta = candidate.position - edge
      if (
        Math.abs(delta) <= threshold &&
        (!best || Math.abs(delta) < Math.abs(best.delta))
      ) {
        best = { delta, line: candidate.position }
      }
    }
  }

  return best ? { offset: best.delta, activeLine: best.line } : { offset: 0 }
}

export interface SnapResult {
  rect: PixelRect
  activeLineX?: number
  activeLineY?: number
}

/** Snaps `rect`'s left/center/right and top/center/bottom edges to the given candidates. */
export function snapRect(
  rect: PixelRect,
  candidatesX: SnapCandidate[],
  candidatesY: SnapCandidate[],
  threshold: number,
): SnapResult {
  const xEdges = [rect.x, rect.x + rect.width / 2, rect.x + rect.width]
  const yEdges = [rect.y, rect.y + rect.height / 2, rect.y + rect.height]

  const xResult = snapAxis(xEdges, candidatesX, threshold)
  const yResult = snapAxis(yEdges, candidatesY, threshold)

  return {
    rect: {
      x: rect.x + xResult.offset,
      y: rect.y + yResult.offset,
      width: rect.width,
      height: rect.height,
    },
    activeLineX: xResult.activeLine,
    activeLineY: yResult.activeLine,
  }
}
