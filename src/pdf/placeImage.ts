import {
  type PDFImage,
  type PDFPage,
  clip,
  concatTransformationMatrix,
  drawObject,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
} from 'pdf-lib'
import {
  type Matrix2D,
  composeMatrices,
  matrixToPdfArray,
  rotationMatrix,
  scaleMatrix,
  translationMatrix,
} from './matrix'

/** A rect in PDF page-point space: `x`/`y` are the bottom-left corner, y-up. */
export interface PlacementRect {
  x: number
  y: number
  width: number
  height: number
}

export interface Placement {
  /** Destination rect the image is scaled to fill. */
  rect: PlacementRect
  /** Clockwise rotation in degrees about the rect's center. */
  rotationDegrees?: number
  flipX?: boolean
  flipY?: boolean
}

/**
 * The affine matrix mapping the unit square `[0,1] x [0,1]` (PDF image space) onto
 * a placement: scale to the rect's size, flip about the rect's own center, rotate
 * about the rect's center, then translate the center into position.
 */
export function placementMatrix(placement: Placement): Matrix2D {
  const { rect, rotationDegrees = 0, flipX = false, flipY = false } = placement
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2

  return composeMatrices(
    scaleMatrix(rect.width, rect.height),
    translationMatrix(-rect.width / 2, -rect.height / 2),
    scaleMatrix(flipX ? -1 : 1, flipY ? -1 : 1),
    rotationMatrix(rotationDegrees),
    translationMatrix(centerX, centerY),
  )
}

/**
 * Draws `image` into `page` per `placement`, clipped to `clipRect` (typically the
 * destination booklet-page rect) so nothing bleeds across the fold into the
 * neighbouring page. Uses raw content-stream operators rather than
 * `page.drawImage()` so rotation, flip, and clipping compose correctly (design.md
 * D5) — `page.drawImage()` has no clip parameter and cannot express flip and
 * rotation about an arbitrary rect together.
 */
export function drawPlacedImage(
  page: PDFPage,
  image: PDFImage,
  placement: Placement,
  clipRect: PlacementRect,
): void {
  const xObjectName = page.node.newXObject('Image', image.ref)
  const [a, b, c, d, e, f] = matrixToPdfArray(placementMatrix(placement))

  page.pushOperators(
    pushGraphicsState(),
    rectangle(clipRect.x, clipRect.y, clipRect.width, clipRect.height),
    clip(),
    endPath(),
    concatTransformationMatrix(a, b, c, d, e, f),
    drawObject(xObjectName),
    popGraphicsState(),
  )
}
