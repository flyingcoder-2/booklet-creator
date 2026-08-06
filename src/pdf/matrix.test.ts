import { describe, expect, it } from 'vitest'
import {
  applyMatrix,
  composeMatrices,
  IDENTITY_MATRIX,
  multiplyMatrices,
  rotationMatrix,
  scaleMatrix,
  translationMatrix,
} from './matrix'

function expectClose(a: { x: number; y: number }, b: { x: number; y: number }) {
  expect(a.x).toBeCloseTo(b.x, 6)
  expect(a.y).toBeCloseTo(b.y, 6)
}

describe('translationMatrix', () => {
  it('translates a point', () => {
    const m = translationMatrix(10, -5)
    expectClose(applyMatrix(m, { x: 1, y: 1 }), { x: 11, y: -4 })
  })
})

describe('scaleMatrix', () => {
  it('scales a point about the origin', () => {
    const m = scaleMatrix(2, 3)
    expectClose(applyMatrix(m, { x: 1, y: 1 }), { x: 2, y: 3 })
  })

  it('negative scale flips about the origin', () => {
    const m = scaleMatrix(-1, 1)
    expectClose(applyMatrix(m, { x: 1, y: 0 }), { x: -1, y: 0 })
  })
})

describe('rotationMatrix', () => {
  it('is the identity at 0 degrees', () => {
    const m = rotationMatrix(0)
    expectClose(applyMatrix(m, { x: 1, y: 0 }), { x: 1, y: 0 })
  })

  it('rotates 90 degrees clockwise: +x axis point moves to -y in PDF (y-up) space', () => {
    // On screen (y-down), clockwise from +x lands on +y; in PDF's y-up space
    // the same on-screen rotation lands on -y.
    const m = rotationMatrix(90)
    expectClose(applyMatrix(m, { x: 1, y: 0 }), { x: 0, y: -1 })
  })

  it('rotates 180 degrees to the opposite point regardless of direction', () => {
    const m = rotationMatrix(180)
    expectClose(applyMatrix(m, { x: 1, y: 0 }), { x: -1, y: 0 })
  })

  it('270 clockwise equals 90 counter-clockwise', () => {
    const m = rotationMatrix(270)
    expectClose(applyMatrix(m, { x: 1, y: 0 }), { x: 0, y: 1 })
  })
})

describe('multiplyMatrices', () => {
  it('identity composed with anything returns the other matrix unchanged', () => {
    const m = translationMatrix(3, 4)
    expect(multiplyMatrices(IDENTITY_MATRIX, m)).toEqual(m)
    expect(multiplyMatrices(m, IDENTITY_MATRIX)).toEqual(m)
  })

  it('applies the right-hand matrix first, then the left-hand matrix', () => {
    // scale(2,2) then translate(10,0): point (1,1) -> scale -> (2,2) -> translate -> (12,2)
    const combined = multiplyMatrices(
      translationMatrix(10, 0),
      scaleMatrix(2, 2),
    )
    expectClose(applyMatrix(combined, { x: 1, y: 1 }), { x: 12, y: 2 })
  })
})

describe('composeMatrices', () => {
  it('applies matrices left to right (first argument first)', () => {
    // scale(2,2) first, then translate(10,0) -- same as the multiplyMatrices case above
    const combined = composeMatrices(
      scaleMatrix(2, 2),
      translationMatrix(10, 0),
    )
    expectClose(applyMatrix(combined, { x: 1, y: 1 }), { x: 12, y: 2 })
  })

  it('composing zero matrices is the identity', () => {
    expect(composeMatrices()).toEqual(IDENTITY_MATRIX)
  })
})
