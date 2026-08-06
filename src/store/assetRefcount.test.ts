import { describe, expect, it } from 'vitest'
import { releaseAsset, retainAsset, type AssetMap } from './assetRefcount'

const META = {
  width: 100,
  height: 200,
  mimeType: 'image/png' as const,
  byteLength: 1234,
}

describe('retainAsset', () => {
  it('creates a new asset with refCount 1', () => {
    const assets = retainAsset({}, 'hash-a', META)
    expect(assets['hash-a']).toEqual({ id: 'hash-a', refCount: 1, ...META })
  })

  it('increments refCount on an existing asset (duplicate page shares assets)', () => {
    const once = retainAsset({}, 'hash-a', META)
    const twice = retainAsset(once, 'hash-a', META)
    expect(twice['hash-a'].refCount).toBe(2)
  })

  it('does not mutate the input map', () => {
    const original: AssetMap = {}
    retainAsset(original, 'hash-a', META)
    expect(original).toEqual({})
  })
})

describe('releaseAsset', () => {
  it('decrements refCount without deleting while references remain', () => {
    let assets = retainAsset({}, 'hash-a', META)
    assets = retainAsset(assets, 'hash-a', META) // refCount 2

    const result = releaseAsset(assets, 'hash-a')
    expect(result.deleted).toBe(false)
    expect(result.assets['hash-a'].refCount).toBe(1)
  })

  it('deletes the asset entry when refCount reaches zero', () => {
    const assets = retainAsset({}, 'hash-a', META) // refCount 1
    const result = releaseAsset(assets, 'hash-a')
    expect(result.deleted).toBe(true)
    expect(result.assets['hash-a']).toBeUndefined()
  })

  it('is a no-op for an asset that is not present', () => {
    const result = releaseAsset({}, 'missing')
    expect(result.deleted).toBe(false)
    expect(result.assets).toEqual({})
  })

  it('full add -> duplicate -> delete-one -> delete-other lifecycle', () => {
    // "Add" an image: one page references the asset.
    let assets = retainAsset({}, 'hash-a', META)
    expect(assets['hash-a'].refCount).toBe(1)

    // "Duplicate" the page: the copy shares the same asset by reference.
    assets = retainAsset(assets, 'hash-a', META)
    expect(assets['hash-a'].refCount).toBe(2)

    // Delete the original page's image: asset survives via the duplicate.
    let result = releaseAsset(assets, 'hash-a')
    expect(result.deleted).toBe(false)
    assets = result.assets
    expect(assets['hash-a'].refCount).toBe(1)

    // Delete the duplicate's image too: now the asset is actually gone.
    result = releaseAsset(assets, 'hash-a')
    expect(result.deleted).toBe(true)
    expect(result.assets['hash-a']).toBeUndefined()
  })
})
