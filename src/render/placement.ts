import type { CropRect, ImageObject } from '../model/types'

export interface PixelSize {
  width: number
  height: number
}

export interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The destination rect (top-left + size) for `object` when the page is
 * rendered at `pageSizePx`, in the same pixel/point units as `pageSizePx`.
 * Because `object`'s position and size are normalized fractions of the page
 * (design.md D3), this is identical up to scale for any `pageSizePx` — the
 * same math drives the thumbnail, the preview, and (via `placeImage.ts`'s
 * point-space equivalent) the PDF export.
 */
export function computeObjectDestRect(
  object: ImageObject,
  pageSizePx: PixelSize,
): PixelRect {
  const width = object.width * pageSizePx.width
  const height = object.height * pageSizePx.height
  const x = object.x * pageSizePx.width - width / 2
  const y = object.y * pageSizePx.height - height / 2
  return { x, y, width, height }
}

/** Converts a crop rect (fractions of the source image) to source-pixel coordinates. */
export function cropToSourcePixelRect(
  crop: CropRect,
  sourceSize: PixelSize,
): PixelRect {
  return {
    x: crop.x * sourceSize.width,
    y: crop.y * sourceSize.height,
    width: crop.width * sourceSize.width,
    height: crop.height * sourceSize.height,
  }
}

export const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 }

/**
 * The largest width/height (as page fractions, each <= 1) that preserve
 * `sourceSize`'s aspect ratio within the page bounds — used to place a
 * newly-imported image "fully visible and centered" (page-editor spec).
 */
export function fitToPageFraction(
  sourceSize: PixelSize,
  pageSizePx: PixelSize,
): PixelSize {
  const imageAspect = sourceSize.width / sourceSize.height
  const pageAspect = pageSizePx.width / pageSizePx.height

  if (imageAspect > pageAspect) {
    return { width: 1, height: pageAspect / imageAspect }
  }
  return { width: imageAspect / pageAspect, height: 1 }
}
