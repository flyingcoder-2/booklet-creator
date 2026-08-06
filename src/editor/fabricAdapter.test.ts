import { describe, expect, it } from 'vitest'
import type { ImageObject } from '../model/types'
import {
  fromFabricTransform,
  isFullCrop,
  toFabricImageProps,
} from './fabricAdapter'

const PAGE_SIZE = { width: 396, height: 612 }

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

describe('toFabricImageProps', () => {
  it('places an uncropped object at page-fraction-derived pixel coordinates', () => {
    const object = makeObject({ x: 0.5, y: 0.25, width: 0.5, height: 0.2 })
    const props = toFabricImageProps(object, PAGE_SIZE, {
      width: 1000,
      height: 800,
    })

    expect(props.left).toBeCloseTo(0.5 * PAGE_SIZE.width, 8)
    expect(props.top).toBeCloseTo(0.25 * PAGE_SIZE.height, 8)
    expect(props.cropX).toBe(0)
    expect(props.cropY).toBe(0)
    expect(props.width).toBe(1000)
    expect(props.height).toBe(800)
    expect(props.scaleX).toBeCloseTo((0.5 * PAGE_SIZE.width) / 1000, 8)
    expect(props.scaleY).toBeCloseTo((0.2 * PAGE_SIZE.height) / 800, 8)
  })

  it('sets cropX/cropY/width/height in source pixels for a partial crop', () => {
    const object = makeObject({
      crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
    })
    const props = toFabricImageProps(object, PAGE_SIZE, {
      width: 2000,
      height: 1000,
    })

    expect(props.cropX).toBeCloseTo(200, 8)
    expect(props.cropY).toBeCloseTo(200, 8)
    expect(props.width).toBeCloseTo(1000, 8)
    expect(props.height).toBeCloseTo(400, 8)
  })

  it('carries rotation, flip, and opacity through unchanged', () => {
    const object = makeObject({
      rotationDegrees: 37,
      flipX: true,
      flipY: true,
      opacity: 0.6,
    })
    const props = toFabricImageProps(object, PAGE_SIZE, {
      width: 100,
      height: 100,
    })
    expect(props.angle).toBe(37)
    expect(props.flipX).toBe(true)
    expect(props.flipY).toBe(true)
    expect(props.opacity).toBe(0.6)
  })

  it('always centers the object (originX/originY = center)', () => {
    const props = toFabricImageProps(makeObject(), PAGE_SIZE, {
      width: 100,
      height: 100,
    })
    expect(props.originX).toBe('center')
    expect(props.originY).toBe('center')
  })
})

describe('fromFabricTransform', () => {
  it('round-trips an uncropped object through hydrate -> (no change) -> read back', () => {
    const original = makeObject({
      x: 0.3,
      y: 0.7,
      width: 0.4,
      height: 0.25,
      rotationDegrees: 15,
    })
    const sourceSize = { width: 800, height: 600 }
    const hydrated = toFabricImageProps(original, PAGE_SIZE, sourceSize)

    const patch = fromFabricTransform(hydrated, PAGE_SIZE)

    expect(patch.x).toBeCloseTo(original.x, 8)
    expect(patch.y).toBeCloseTo(original.y, 8)
    expect(patch.width).toBeCloseTo(original.width, 8)
    expect(patch.height).toBeCloseTo(original.height, 8)
    expect(patch.rotationDegrees).toBeCloseTo(original.rotationDegrees, 8)
  })

  it('round-trips a cropped object: a resize changes scale, not the crop rect', () => {
    const original = makeObject({
      width: 0.4,
      height: 0.3,
      crop: { x: 0.2, y: 0.1, width: 0.5, height: 0.6 },
    })
    const sourceSize = { width: 1000, height: 1000 }
    const hydrated = toFabricImageProps(original, PAGE_SIZE, sourceSize)

    // Simulate the user dragging a resize handle: only scaleX/scaleY change,
    // exactly as Fabric would report on a real resize (width/height/cropX/
    // cropY stay put -- see the comment on fromFabricTransform).
    const resized = {
      ...hydrated,
      scaleX: hydrated.scaleX * 1.5,
      scaleY: hydrated.scaleY * 1.5,
    }
    const patch = fromFabricTransform(resized, PAGE_SIZE)

    expect(patch.width).toBeCloseTo(original.width * 1.5, 8)
    expect(patch.height).toBeCloseTo(original.height * 1.5, 8)
    // Crop is not part of this patch at all -- callers must not touch it here.
    expect('crop' in patch).toBe(false)
  })

  it('reports flip and opacity changes made directly on the canvas', () => {
    const hydrated = toFabricImageProps(makeObject(), PAGE_SIZE, {
      width: 100,
      height: 100,
    })
    const patch = fromFabricTransform(
      { ...hydrated, flipX: true, opacity: 0.4 },
      PAGE_SIZE,
    )
    expect(patch.flipX).toBe(true)
    expect(patch.opacity).toBe(0.4)
  })
})

describe('isFullCrop', () => {
  it('treats undefined as full crop', () => {
    expect(isFullCrop(undefined)).toBe(true)
  })

  it('treats {0,0,1,1} as full crop', () => {
    expect(isFullCrop({ x: 0, y: 0, width: 1, height: 1 })).toBe(true)
  })

  it('treats any narrower rect as not full', () => {
    expect(isFullCrop({ x: 0, y: 0, width: 0.9, height: 1 })).toBe(false)
  })
})
