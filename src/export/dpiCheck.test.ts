import { describe, expect, it } from 'vitest'
import type { AssetMeta, ImageObject, Page, Project } from '../model/types'
import {
  computeEffectiveDpi,
  findLowDpiPlacements,
  MIN_RECOMMENDED_DPI,
} from './dpiCheck'

function makeObject(overrides: Partial<ImageObject> = {}): ImageObject {
  return {
    id: 'obj-1',
    assetId: 'asset-1',
    x: 0.5,
    y: 0.5,
    width: 0.5,
    height: 0.5,
    rotationDegrees: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    ...overrides,
  }
}

const META: AssetMeta = {
  id: 'asset-1',
  refCount: 1,
  width: 1500,
  height: 1500,
  mimeType: 'image/png',
  byteLength: 10,
}

describe('computeEffectiveDpi', () => {
  it('a 1500px image printed at 5in (360pt) is 300 DPI exactly', () => {
    const { dpiX, dpiY } = computeEffectiveDpi(makeObject(), META, 360, 360)
    expect(dpiX).toBeCloseTo(300, 6)
    expect(dpiY).toBeCloseTo(300, 6)
  })

  it('the same image printed larger has lower effective DPI', () => {
    const { dpiX } = computeEffectiveDpi(makeObject(), META, 720, 720)
    expect(dpiX).toBeCloseTo(150, 6)
  })

  it('cropping reduces the source pixels available, lowering DPI at the same print size', () => {
    const cropped = makeObject({
      crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    })
    const { dpiX } = computeEffectiveDpi(cropped, META, 360, 360)
    // Half the source pixels in each axis at the same print size -> half the DPI.
    expect(dpiX).toBeCloseTo(150, 6)
  })
})

describe('findLowDpiPlacements', () => {
  const pageSizePt = { width: 396, height: 612 }

  function makeProject(
    object: ImageObject,
    assetMeta: AssetMeta,
  ): Pick<Project, 'pageOrder' | 'pages' | 'objects' | 'assets'> {
    const page: Page = { id: 'page-1', objectOrder: [object.id] }
    return {
      pageOrder: ['page-1'],
      pages: { 'page-1': page },
      objects: { [object.id]: object },
      assets: { [assetMeta.id]: assetMeta },
    }
  }

  it('flags a placement below 300 DPI, naming its page number', () => {
    // Full page (396x612pt) with a small 100x100 source -- well under 300 DPI.
    const object = makeObject({ width: 1, height: 1 })
    const lowResMeta: AssetMeta = { ...META, width: 100, height: 100 }
    const project = makeProject(object, lowResMeta)

    const results = findLowDpiPlacements(project, pageSizePt)
    expect(results).toHaveLength(1)
    expect(results[0].pageNumber).toBe(1)
    expect(results[0].dpi).toBeLessThan(MIN_RECOMMENDED_DPI)
  })

  it('does not flag a placement at or above 300 DPI', () => {
    const object = makeObject({ width: 0.1, height: 0.1 }) // small printed size
    const project = makeProject(object, META) // large source
    expect(findLowDpiPlacements(project, pageSizePt)).toHaveLength(0)
  })
})
