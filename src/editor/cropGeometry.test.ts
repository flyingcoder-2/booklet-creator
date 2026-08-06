import { describe, expect, it } from 'vitest'
import {
  clampCropRect,
  cropRectToPatch,
  fullImageDisplayRect,
} from './cropGeometry'

const PAGE_SIZE = { width: 400, height: 600 }

describe('fullImageDisplayRect', () => {
  it('for an uncropped object, the full rect equals the dest rect', () => {
    const dest = { x: 50, y: 60, width: 100, height: 80 }
    const full = fullImageDisplayRect(dest, undefined, {
      width: 500,
      height: 400,
    })
    expect(full).toEqual(dest)
  })

  it('for a cropped object, the full rect is larger and positioned so the crop sub-region equals the dest rect', () => {
    const dest = { x: 100, y: 100, width: 100, height: 100 }
    const crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } // center half
    const sourceSize = { width: 200, height: 200 }

    const full = fullImageDisplayRect(dest, crop, sourceSize)

    // Crop covers 50% of the source in each axis, so the full image is 2x the dest size.
    expect(full.width).toBeCloseTo(200, 8)
    expect(full.height).toBeCloseTo(200, 8)
    // The crop's top-left (25% in) should land exactly at dest's top-left.
    expect(full.x + 0.25 * full.width).toBeCloseTo(dest.x, 8)
    expect(full.y + 0.25 * full.height).toBeCloseTo(dest.y, 8)
  })
})

describe('cropRectToPatch', () => {
  it('is the exact inverse of fullImageDisplayRect when the crop rect is left unchanged', () => {
    const dest = { x: 40, y: 30, width: 120, height: 90 }
    const crop = { x: 0.1, y: 0.2, width: 0.6, height: 0.5 }
    const sourceSize = { width: 800, height: 600 }

    const full = fullImageDisplayRect(dest, crop, sourceSize)
    const patch = cropRectToPatch(dest, full, PAGE_SIZE)

    expect(patch.crop.x).toBeCloseTo(crop.x, 8)
    expect(patch.crop.y).toBeCloseTo(crop.y, 8)
    expect(patch.crop.width).toBeCloseTo(crop.width, 8)
    expect(patch.crop.height).toBeCloseTo(crop.height, 8)
    expect(patch.width).toBeCloseTo(dest.width / PAGE_SIZE.width, 8)
    expect(patch.height).toBeCloseTo(dest.height / PAGE_SIZE.height, 8)
  })

  it('re-editing to the full bounds produces a full crop (0,0,1,1)', () => {
    const dest = { x: 40, y: 30, width: 120, height: 90 }
    const crop = { x: 0.1, y: 0.2, width: 0.6, height: 0.5 }
    const full = fullImageDisplayRect(dest, crop, { width: 800, height: 600 })

    // User drags the crop rect out to the full image bounds.
    const patch = cropRectToPatch(full, full, PAGE_SIZE)
    expect(patch.crop).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })

  it('shrinking the crop rect inward produces a narrower crop fraction', () => {
    const dest = { x: 0, y: 0, width: 100, height: 100 }
    const full = fullImageDisplayRect(dest, undefined, {
      width: 100,
      height: 100,
    })

    const shrunk = { x: 25, y: 25, width: 50, height: 50 }
    const patch = cropRectToPatch(shrunk, full, PAGE_SIZE)

    expect(patch.crop).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
  })
})

describe('clampCropRect', () => {
  const full = { x: 0, y: 0, width: 200, height: 200 }

  it('leaves a rect fully inside the bounds unchanged', () => {
    const inside = { x: 10, y: 10, width: 50, height: 50 }
    expect(clampCropRect(inside, full)).toEqual(inside)
  })

  it('pulls a rect back inside when it has been dragged past the edge', () => {
    const overflowing = { x: -20, y: 190, width: 50, height: 50 }
    const clamped = clampCropRect(overflowing, full)
    expect(clamped.x).toBe(0)
    expect(clamped.y).toBe(150)
    expect(clamped.width).toBe(50)
    expect(clamped.height).toBe(50)
  })

  it('never grows the rect beyond the full bounds', () => {
    const tooBig = { x: -50, y: -50, width: 300, height: 300 }
    const clamped = clampCropRect(tooBig, full)
    expect(clamped).toEqual({ x: 0, y: 0, width: 200, height: 200 })
  })
})
