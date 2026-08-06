import { describe, expect, it } from 'vitest'
import type { ImageObject } from '../model/types'
import { computeObjectDestRect } from '../render/placement'
import { computePdfPlacement } from './pdfPlacement'

function makeObject(overrides: Partial<ImageObject> = {}): ImageObject {
  return {
    id: 'obj-1',
    assetId: 'asset-1',
    x: 0.5,
    y: 0.5,
    width: 0.4,
    height: 0.3,
    rotationDegrees: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    ...overrides,
  }
}

const RECT = { x: 100, y: 50, width: 400, height: 600 }

describe('computePdfPlacement', () => {
  it('a full-page centered object maps exactly onto rectPt', () => {
    const placement = computePdfPlacement(
      makeObject({ x: 0.5, y: 0.5, width: 1, height: 1 }),
      RECT,
    )
    expect(placement.rect).toEqual(RECT)
  })

  it.each([
    [0.5, 0.5],
    [0, 0],
    [1, 1],
    [0.2, 0.8],
    [0.9, 0.1],
  ])(
    'matches the canvas renderer (computeObjectDestRect), y-flipped into PDF space, for x=%s y=%s',
    (x, y) => {
      const object = makeObject({ x, y, width: 0.2, height: 0.1 })

      // Ground truth: where the canvas renderer (y-down) would place this
      // object within a target the size of rectPt, then convert that
      // y-down rect into rectPt's absolute y-up space by hand.
      const canvasDest = computeObjectDestRect(object, {
        width: RECT.width,
        height: RECT.height,
      })
      const expected = {
        x: RECT.x + canvasDest.x,
        y: RECT.y + RECT.height - (canvasDest.y + canvasDest.height),
        width: canvasDest.width,
        height: canvasDest.height,
      }

      const placement = computePdfPlacement(object, RECT)
      expect(placement.rect.x).toBeCloseTo(expected.x, 8)
      expect(placement.rect.y).toBeCloseTo(expected.y, 8)
      expect(placement.rect.width).toBeCloseTo(expected.width, 8)
      expect(placement.rect.height).toBeCloseTo(expected.height, 8)
    },
  )

  it('passes rotation and flip through unchanged', () => {
    const placement = computePdfPlacement(
      makeObject({ rotationDegrees: 42, flipX: true, flipY: true }),
      RECT,
    )
    expect(placement.rotationDegrees).toBe(42)
    expect(placement.flipX).toBe(true)
    expect(placement.flipY).toBe(true)
  })

  it('scales size by rectPt dimensions independent of rectPt position', () => {
    const a = computePdfPlacement(
      makeObject({ width: 0.5, height: 0.25 }),
      RECT,
    )
    const shifted = { ...RECT, x: RECT.x + 1000, y: RECT.y + 2000 }
    const b = computePdfPlacement(
      makeObject({ width: 0.5, height: 0.25 }),
      shifted,
    )
    expect(a.rect.width).toBe(b.rect.width)
    expect(a.rect.height).toBe(b.rect.height)
  })
})
