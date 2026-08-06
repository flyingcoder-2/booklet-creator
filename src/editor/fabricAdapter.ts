import type { CropRect, ImageObject } from '../model/types'
import {
  cropToSourcePixelRect,
  FULL_CROP,
  type PixelSize,
} from '../render/placement'

/**
 * Pure conversions between the store's normalized `ImageObject` and the
 * Fabric.js v6 image properties that represent it on the live canvas
 * (design.md D1/D2: Fabric is a view, never the source of truth). Kept free
 * of any Fabric import so the mapping itself is unit-testable without a
 * canvas or DOM.
 */

export interface FabricImageProps {
  left: number
  top: number
  angle: number
  flipX: boolean
  flipY: boolean
  opacity: number
  cropX: number
  cropY: number
  width: number
  height: number
  scaleX: number
  scaleY: number
  originX: 'center'
  originY: 'center'
}

/** Fabric property values that hydrate a canvas image from the store (store -> Fabric). */
export function toFabricImageProps(
  object: ImageObject,
  pageSizePx: PixelSize,
  sourceSize: PixelSize,
): FabricImageProps {
  const destWidth = object.width * pageSizePx.width
  const destHeight = object.height * pageSizePx.height
  const crop = cropToSourcePixelRect(object.crop ?? FULL_CROP, sourceSize)

  return {
    left: object.x * pageSizePx.width,
    top: object.y * pageSizePx.height,
    angle: object.rotationDegrees,
    flipX: object.flipX,
    flipY: object.flipY,
    opacity: object.opacity,
    cropX: crop.x,
    cropY: crop.y,
    width: crop.width,
    height: crop.height,
    scaleX: crop.width === 0 ? 1 : destWidth / crop.width,
    scaleY: crop.height === 0 ? 1 : destHeight / crop.height,
    originX: 'center',
    originY: 'center',
  }
}

/** The subset of Fabric object state read back after a move/resize/rotate/flip commit. */
export interface FabricTransformState {
  left: number
  top: number
  angle: number
  flipX: boolean
  flipY: boolean
  opacity: number
  width: number
  height: number
  scaleX: number
  scaleY: number
}

/**
 * Store patch for a generic transform commit (`object:modified` after a
 * drag/resize/rotate/flip/opacity change). Deliberately excludes `crop`:
 * Fabric's own `width`/`height`/`cropX`/`cropY` do not change during a plain
 * move or resize (only `left`/`top`/`scaleX`/`scaleY`/`angle` do), so crop is
 * only ever updated by the dedicated crop-mode flow.
 */
export function fromFabricTransform(
  fabric: FabricTransformState,
  pageSizePx: PixelSize,
): Pick<
  ImageObject,
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'rotationDegrees'
  | 'flipX'
  | 'flipY'
  | 'opacity'
> {
  const destWidth = fabric.width * fabric.scaleX
  const destHeight = fabric.height * fabric.scaleY

  return {
    x: fabric.left / pageSizePx.width,
    y: fabric.top / pageSizePx.height,
    width: destWidth / pageSizePx.width,
    height: destHeight / pageSizePx.height,
    rotationDegrees: fabric.angle,
    flipX: fabric.flipX,
    flipY: fabric.flipY,
    opacity: fabric.opacity,
  }
}

export function isFullCrop(crop: CropRect | undefined): boolean {
  if (!crop) return true
  return crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1
}
