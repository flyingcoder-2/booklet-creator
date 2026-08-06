import { describe, expect, it } from 'vitest'
import type { ImageObject, Page } from '../model/types'
import { pageContentHash } from './pageContentHash'

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

describe('pageContentHash', () => {
  it('is stable for identical content', () => {
    const page: Page = { id: 'p1', objectOrder: ['obj-1'] }
    const objects = { 'obj-1': makeObject() }
    expect(pageContentHash(page, objects)).toBe(pageContentHash(page, objects))
  })

  it('changes when an object moves', () => {
    const page: Page = { id: 'p1', objectOrder: ['obj-1'] }
    const before = pageContentHash(page, { 'obj-1': makeObject({ x: 0.5 }) })
    const after = pageContentHash(page, { 'obj-1': makeObject({ x: 0.6 }) })
    expect(before).not.toBe(after)
  })

  it('changes when the object order (layering) changes', () => {
    const objects = {
      a: makeObject({ id: 'a', assetId: 'asset-a' }),
      b: makeObject({ id: 'b', assetId: 'asset-b' }),
    }
    const orderAB = pageContentHash(
      { id: 'p1', objectOrder: ['a', 'b'] },
      objects,
    )
    const orderBA = pageContentHash(
      { id: 'p1', objectOrder: ['b', 'a'] },
      objects,
    )
    expect(orderAB).not.toBe(orderBA)
  })

  it('is the same for two empty pages regardless of id', () => {
    const empty1 = pageContentHash({ id: 'p1', objectOrder: [] }, {})
    const empty2 = pageContentHash({ id: 'p2', objectOrder: [] }, {})
    expect(empty1).toBe(empty2)
  })

  it('changes when a crop is added', () => {
    const objects1 = { 'obj-1': makeObject() }
    const objects2 = {
      'obj-1': makeObject({
        crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
      }),
    }
    const page: Page = { id: 'p1', objectOrder: ['obj-1'] }
    expect(pageContentHash(page, objects1)).not.toBe(
      pageContentHash(page, objects2),
    )
  })
})
