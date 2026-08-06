import { useEffect, useState } from 'react'
import { loadImageElement } from '../editor/imageCache'
import type { AssetMeta, Page, Project } from '../model/types'
import type { PixelSize } from '../render/placement'
import type { RenderableObject } from '../render/renderPage'
import { pageContentHash } from './pageContentHash'
import { getOrCreateThumbnail } from './thumbnailCache'

/**
 * Lazily renders (or reuses a cached render of) `page`'s thumbnail. Because
 * this only runs for mounted rows, and the sidebar list is virtualized,
 * thumbnails are generated only for pages near the viewport.
 */
export function useThumbnail(
  page: Page,
  objects: Project['objects'],
  assets: Project['assets'],
  size: PixelSize,
): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined)
  const contentHash = pageContentHash(page, objects)

  useEffect(() => {
    let cancelled = false

    async function run() {
      const renderable: RenderableObject[] = []
      for (const objectId of page.objectOrder) {
        const object = objects[objectId]
        const meta: AssetMeta | undefined = object && assets[object.assetId]
        if (!object || !meta) continue
        const image = await loadImageElement(object.assetId)
        if (cancelled) return
        renderable.push({
          object,
          image,
          sourceSize: { width: meta.width, height: meta.height },
        })
      }
      const thumbnailUrl = await getOrCreateThumbnail(
        contentHash,
        renderable,
        size,
      )
      if (!cancelled) setUrl(thumbnailUrl)
    }

    void run()
    return () => {
      cancelled = true
    }
    // `objects`/`assets` are read through `page.objectOrder` -- `contentHash`
    // already captures every visible change to them for this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentHash, page.objectOrder, size.width, size.height])

  return url
}
