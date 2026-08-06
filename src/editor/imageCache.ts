import { getAssetBytes } from '../assets/assetStore'
import type { AssetId } from '../model/types'

/**
 * Decoded `<img>` elements keyed by asset id, so the same element (and
 * decoded bitmap) is reused across every object that references the asset —
 * sharing an asset across duplicated pages costs one decode, not many.
 */
const cache = new Map<AssetId, HTMLImageElement>()
const pending = new Map<AssetId, Promise<HTMLImageElement>>()

export async function loadImageElement(
  assetId: AssetId,
): Promise<HTMLImageElement> {
  const cached = cache.get(assetId)
  if (cached) return cached

  const inFlight = pending.get(assetId)
  if (inFlight) return inFlight

  const promise = (async () => {
    const blob = await getAssetBytes(assetId)
    if (!blob) throw new Error(`No stored bytes for asset ${assetId}`)

    const url = URL.createObjectURL(blob)
    try {
      const image = new Image()
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () =>
          reject(new Error(`Failed to decode asset ${assetId}`))
        image.src = url
      })
      cache.set(assetId, image)
      return image
    } finally {
      URL.revokeObjectURL(url)
      pending.delete(assetId)
    }
  })()

  pending.set(assetId, promise)
  return promise
}

export function evictImage(assetId: AssetId): void {
  cache.delete(assetId)
}
