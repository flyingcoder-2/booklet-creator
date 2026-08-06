import type { ImageObject } from '../model/types'
import {
  computeObjectDestRect,
  cropToSourcePixelRect,
  FULL_CROP,
  type PixelSize,
} from './placement'

/**
 * The subset of the Canvas 2D API this renderer needs, satisfied by both
 * `CanvasRenderingContext2D` and `OffscreenCanvasRenderingContext2D` — so the
 * same function draws into an on-screen `<canvas>` (preview, thumbnail) or an
 * `OffscreenCanvas` (worker-rendered thumbnails, raster export).
 */
export interface Canvas2DLike {
  save(): void
  restore(): void
  translate(x: number, y: number): void
  rotate(angleRadians: number): void
  scale(x: number, y: number): void
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sWidth: number,
    sHeight: number,
    dx: number,
    dy: number,
    dWidth: number,
    dHeight: number,
  ): void
  globalAlpha: number
}

export interface RenderableObject {
  object: ImageObject
  image: CanvasImageSource
  sourceSize: PixelSize
}

/**
 * Draws one booklet page's objects, in layer order, into `ctx` at
 * `pageSizePx`. This is the one renderer shared by thumbnails, print preview,
 * and raster export (design.md D8) — it draws page content only, never
 * margins, safe area, guides, grid, or selection handles (design.md, page-
 * editor spec "Canvas overlays and guides"). Overlays are drawn separately by
 * the interactive editor and are never part of this function.
 */
export function renderPage(
  ctx: Canvas2DLike,
  objectsBottomToTop: RenderableObject[],
  pageSizePx: PixelSize,
): void {
  for (const { object, image, sourceSize } of objectsBottomToTop) {
    drawObject(ctx, object, image, sourceSize, pageSizePx)
  }
}

function drawObject(
  ctx: Canvas2DLike,
  object: ImageObject,
  image: CanvasImageSource,
  sourceSize: PixelSize,
  pageSizePx: PixelSize,
): void {
  const dest = computeObjectDestRect(object, pageSizePx)
  const source = cropToSourcePixelRect(object.crop ?? FULL_CROP, sourceSize)

  ctx.save()
  ctx.globalAlpha = object.opacity
  ctx.translate(dest.x + dest.width / 2, dest.y + dest.height / 2)
  // Canvas 2D space is y-down, so a positive `rotate()` angle is already
  // clockwise on screen -- no sign flip needed here (contrast placeImage.ts,
  // which negates the angle because PDF space is y-up).
  ctx.rotate((object.rotationDegrees * Math.PI) / 180)
  ctx.scale(object.flipX ? -1 : 1, object.flipY ? -1 : 1)
  ctx.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    -dest.width / 2,
    -dest.height / 2,
    dest.width,
    dest.height,
  )
  ctx.restore()
}
