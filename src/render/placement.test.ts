import { describe, expect, it } from 'vitest'
import type { ImageObject } from '../model/types'
import {
  computeObjectDestRect,
  cropToSourcePixelRect,
  fitToPageFraction,
} from './placement'

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

describe('computeObjectDestRect', () => {
  it('centers a full-page object exactly at the page center', () => {
    const object = makeObject({ x: 0.5, y: 0.5, width: 1, height: 1 })
    const rect = computeObjectDestRect(object, { width: 400, height: 800 })
    expect(rect).toEqual({ x: 0, y: 0, width: 400, height: 800 })
  })

  it('is identical up to scale across thumbnail, preview, and PDF-point output sizes', () => {
    // Same object, three wildly different output sizes: a small thumbnail
    // (px), a mid-size preview (px), and a PDF-point page size.
    const object = makeObject({ x: 0.25, y: 0.75, width: 0.4, height: 0.2 })
    const sizes = [
      { width: 60, height: 90 }, // thumbnail
      { width: 400, height: 600 }, // preview
      { width: 396, height: 612 }, // half-Letter in points
    ]

    for (const size of sizes) {
      const rect = computeObjectDestRect(object, size)
      // Express the result back as fractions of the page -- these must match
      // the object's own normalized fields regardless of `size`.
      expect(rect.width / size.width).toBeCloseTo(object.width, 10)
      expect(rect.height / size.height).toBeCloseTo(object.height, 10)
      expect((rect.x + rect.width / 2) / size.width).toBeCloseTo(object.x, 10)
      expect((rect.y + rect.height / 2) / size.height).toBeCloseTo(object.y, 10)
    }
  })

  it('scales linearly: doubling the output size doubles the dest rect', () => {
    const object = makeObject()
    const small = computeObjectDestRect(object, { width: 100, height: 200 })
    const large = computeObjectDestRect(object, { width: 200, height: 400 })

    expect(large.width).toBeCloseTo(small.width * 2, 10)
    expect(large.height).toBeCloseTo(small.height * 2, 10)
    expect(large.x).toBeCloseTo(small.x * 2, 10)
    expect(large.y).toBeCloseTo(small.y * 2, 10)
  })
})

describe('cropToSourcePixelRect', () => {
  it('maps a full crop to the entire source image', () => {
    const rect = cropToSourcePixelRect(
      { x: 0, y: 0, width: 1, height: 1 },
      { width: 1000, height: 500 },
    )
    expect(rect).toEqual({ x: 0, y: 0, width: 1000, height: 500 })
  })

  it('maps a partial crop proportionally regardless of source resolution', () => {
    const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.25 }
    for (const size of [
      { width: 400, height: 300 },
      { width: 4000, height: 3000 },
    ]) {
      const rect = cropToSourcePixelRect(crop, size)
      expect(rect.x / size.width).toBeCloseTo(crop.x, 10)
      expect(rect.y / size.height).toBeCloseTo(crop.y, 10)
      expect(rect.width / size.width).toBeCloseTo(crop.width, 10)
      expect(rect.height / size.height).toBeCloseTo(crop.height, 10)
    }
  })
})

describe('fitToPageFraction', () => {
  it('fits a wider-than-page image to full width', () => {
    const { width, height } = fitToPageFraction(
      { width: 2000, height: 500 },
      { width: 400, height: 600 },
    )
    expect(width).toBe(1)
    expect(height).toBeLessThan(1)
  })

  it('fits a taller-than-page image to full height', () => {
    const { width, height } = fitToPageFraction(
      { width: 500, height: 2000 },
      { width: 400, height: 600 },
    )
    expect(height).toBe(1)
    expect(width).toBeLessThan(1)
  })

  it('preserves the source aspect ratio', () => {
    const sourceSize = { width: 1200, height: 800 }
    const pageSizePx = { width: 400, height: 600 }
    const { width, height } = fitToPageFraction(sourceSize, pageSizePx)
    const resultAspect =
      (width * pageSizePx.width) / (height * pageSizePx.height)
    expect(resultAspect).toBeCloseTo(sourceSize.width / sourceSize.height, 10)
  })
})
