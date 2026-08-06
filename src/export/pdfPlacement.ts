import type { Rect } from '../imposition/geometry'
import type { ImageObject } from '../model/types'
import type { Placement } from '../pdf/placeImage'

/**
 * Converts a booklet-page-normalized object into an absolute PDF placement
 * within `rectPt` (that page's rect on the sheet, from `pageRects`/
 * `slotRects`). `rotationDegrees`/`flipX`/`flipY` pass straight through --
 * they're local mirror/rotation about the object's own center, which is
 * meaningful the same way regardless of which way the page's y-axis points.
 *
 * Only the *center position* needs an axis flip: `object.y` is defined in
 * the editor's canvas convention (0 = top of page, y-down), but PDF space is
 * y-up (0 = bottom), so `centerY` mirrors `object.y` within the rect.
 */
export function computePdfPlacement(
  object: ImageObject,
  rectPt: Rect,
): Placement {
  const width = object.width * rectPt.width
  const height = object.height * rectPt.height
  const centerX = rectPt.x + object.x * rectPt.width
  const centerY = rectPt.y + (1 - object.y) * rectPt.height

  return {
    rect: {
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
    },
    rotationDegrees: object.rotationDegrees,
    flipX: object.flipX,
    flipY: object.flipY,
  }
}
