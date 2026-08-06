import type { AssetId, AssetMeta } from '../model/types'

/**
 * Pure reference-counting transitions over the store's asset metadata map
 * (design.md D4). The actual bytes in IndexedDB are managed separately by
 * `assets/assetStore.ts`; these functions only decide when a byte-store
 * delete is warranted, by tracking `refCount` on the plain data.
 */

export type AssetMap = Record<AssetId, AssetMeta>

/** Registers a new reference to an asset. Pass `meta` when the asset may not exist yet. */
export function retainAsset(
  assets: AssetMap,
  assetId: AssetId,
  meta: Omit<AssetMeta, 'id' | 'refCount'>,
): AssetMap {
  const existing = assets[assetId]
  const next: AssetMap = { ...assets }
  next[assetId] = existing
    ? { ...existing, refCount: existing.refCount + 1 }
    : { id: assetId, refCount: 1, ...meta }
  return next
}

export interface ReleaseResult {
  assets: AssetMap
  /** True if this release dropped the ref count to zero (caller should delete the bytes). */
  deleted: boolean
}

/** Releases one reference. When the count reaches zero, the asset is removed from the map. */
export function releaseAsset(
  assets: AssetMap,
  assetId: AssetId,
): ReleaseResult {
  const existing = assets[assetId]
  if (!existing) {
    return { assets, deleted: false }
  }

  const nextCount = existing.refCount - 1
  const next: AssetMap = { ...assets }

  if (nextCount <= 0) {
    delete next[assetId]
    return { assets: next, deleted: true }
  }

  next[assetId] = { ...existing, refCount: nextCount }
  return { assets: next, deleted: false }
}
