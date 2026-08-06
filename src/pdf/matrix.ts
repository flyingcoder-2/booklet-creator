/**
 * 2D affine transform matrices in PDF's `[a b c d e f]` convention:
 *   x' = a*x + c*y + e
 *   y' = b*x + d*y + f
 *
 * PDF page space is y-up (origin bottom-left).
 */
export interface Matrix2D {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export const IDENTITY_MATRIX: Matrix2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

/** Composition: applying the result to a point equals applying `m2` then `m1`. */
export function multiplyMatrices(m1: Matrix2D, m2: Matrix2D): Matrix2D {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  }
}

/**
 * Composes matrices in application order: `composeMatrices(A, B, C)` means "apply
 * A to the point first, then B, then C" (i.e. it returns `C ∘ B ∘ A`).
 */
export function composeMatrices(...matrices: Matrix2D[]): Matrix2D {
  return matrices.reduce((acc, m) => multiplyMatrices(m, acc), IDENTITY_MATRIX)
}

export function translationMatrix(tx: number, ty: number): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty }
}

export function scaleMatrix(sx: number, sy: number): Matrix2D {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 }
}

/**
 * Rotation about the origin. `degreesClockwise` follows the common UI convention
 * (positive = clockwise as seen on screen). Because PDF space is y-up, a clockwise
 * on-screen rotation corresponds to a negative angle in the standard
 * counter-clockwise-positive rotation matrix.
 */
export function rotationMatrix(degreesClockwise: number): Matrix2D {
  const radians = (-degreesClockwise * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
}

export function applyMatrix(
  m: Matrix2D,
  point: { x: number; y: number },
): {
  x: number
  y: number
} {
  return {
    x: m.a * point.x + m.c * point.y + m.e,
    y: m.b * point.x + m.d * point.y + m.f,
  }
}

export function matrixToPdfArray(
  m: Matrix2D,
): [number, number, number, number, number, number] {
  return [m.a, m.b, m.c, m.d, m.e, m.f]
}
