import { renderPage, type RenderableObject } from '../render/renderPage'
import type { PixelSize } from '../render/placement'

const MAX_CACHED_THUMBNAILS = 300

/** LRU (via Map insertion order) of content-hash -> thumbnail object URL. */
const cache = new Map<string, string>()
const pending = new Map<string, Promise<string>>()

function touch(key: string, value: string): void {
  cache.delete(key)
  cache.set(key, value)
}

function evictOldestIfOverCapacity(): void {
  while (cache.size > MAX_CACHED_THUMBNAILS) {
    const oldestKey = cache.keys().next().value
    if (oldestKey === undefined) break
    const url = cache.get(oldestKey)
    if (url) URL.revokeObjectURL(url)
    cache.delete(oldestKey)
  }
}

/**
 * Returns a thumbnail object URL for the given content hash, rendering it
 * (via the shared `renderPage`, so it can never disagree with the editor,
 * preview, or export) if it isn't already cached. Concurrent requests for
 * the same hash share one render.
 */
export async function getOrCreateThumbnail(
  contentHash: string,
  objects: RenderableObject[],
  size: PixelSize,
): Promise<string> {
  const cached = cache.get(contentHash)
  if (cached) {
    touch(contentHash, cached)
    return cached
  }

  const inFlight = pending.get(contentHash)
  if (inFlight) return inFlight

  const promise = (async () => {
    const canvas = new OffscreenCanvas(size.width, size.height)
    const ctx = canvas.getContext('2d')
    if (!ctx)
      throw new Error(
        'getOrCreateThumbnail: could not acquire a 2D canvas context',
      )

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size.width, size.height)
    renderPage(ctx, objects, size)

    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const url = URL.createObjectURL(blob)
    cache.set(contentHash, url)
    evictOldestIfOverCapacity()
    pending.delete(contentHash)
    return url
  })()

  pending.set(contentHash, promise)
  return promise
}
