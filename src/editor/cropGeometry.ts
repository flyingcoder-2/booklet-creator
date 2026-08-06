import type { CropRect } from '../model/types'
import {
  cropToSourcePixelRect,
  FULL_CROP,
  type PixelRect,
  type PixelSize,
} from '../render/placement'

/**
 * Pure geometry for crop mode (page-editor spec "Image cropping"). Crop mode
 * shows the image's full, uncropped extent with a draggable rect over it —
 * re-entering crop mode on an already-cropped image must show the previous
 * crop rect over the full image, adjustable back out to the original bounds.
 * These two functions are exact inverses of each other.
 */

/**
 * The on-screen rect the FULL (uncropped) image would occupy so that its
 * current crop sub-region exactly fills `destRectPx` (the object's current
 * on-canvas frame). This is what crop mode displays in place of the cropped
 * image.
 */
export function fullImageDisplayRect(
  destRectPx: PixelRect,
  crop: CropRect | undefined,
  sourceSize: PixelSize,
): PixelRect {
  const cropPx = cropToSourcePixelRect(crop ?? FULL_CROP, sourceSize)
  const scaleX = cropPx.width === 0 ? 1 : destRectPx.width / cropPx.width
  const scaleY = cropPx.height === 0 ? 1 : destRectPx.height / cropPx.height

  return {
    x: destRectPx.x - cropPx.x * scaleX,
    y: destRectPx.y - cropPx.y * scaleY,
    width: sourceSize.width * scaleX,
    height: sourceSize.height * scaleY,
  }
}

export interface CropConfirmPatch {
  crop: CropRect
  x: number
  y: number
  width: number
  height: number
}

/**
 * Converts the user's adjusted crop rect (a sub-rect of `fullRectPx`, in the
 * same page-pixel space) into the store patch to apply on confirm: the new
 * crop fraction, and the object's new frame (position/size), which becomes
 * exactly the crop rect.
 */
export function cropRectToPatch(
  cropRectPx: PixelRect,
  fullRectPx: PixelRect,
  pageSizePx: PixelSize,
): CropConfirmPatch {
  const crop: CropRect = {
    x: (cropRectPx.x - fullRectPx.x) / fullRectPx.width,
    y: (cropRectPx.y - fullRectPx.y) / fullRectPx.height,
    width: cropRectPx.width / fullRectPx.width,
    height: cropRectPx.height / fullRectPx.height,
  }

  return {
    crop,
    x: (cropRectPx.x + cropRectPx.width / 2) / pageSizePx.width,
    y: (cropRectPx.y + cropRectPx.height / 2) / pageSizePx.height,
    width: cropRectPx.width / pageSizePx.width,
    height: cropRectPx.height / pageSizePx.height,
  }
}

/** Clamps a crop rect (page-px space) to stay within the full image's display bounds. */
export function clampCropRect(
  cropRectPx: PixelRect,
  fullRectPx: PixelRect,
): PixelRect {
  const width = Math.min(cropRectPx.width, fullRectPx.width)
  const height = Math.min(cropRectPx.height, fullRectPx.height)
  const x = Math.min(
    Math.max(cropRectPx.x, fullRectPx.x),
    fullRectPx.x + fullRectPx.width - width,
  )
  const y = Math.min(
    Math.max(cropRectPx.y, fullRectPx.y),
    fullRectPx.y + fullRectPx.height - height,
  )
  return { x, y, width, height }
}
