import type { ImageObject, Page, Project } from '../model/types'

/**
 * A fast, non-cryptographic content key for a page's rendered appearance:
 * changes iff any object's visible fields change. Used to key the thumbnail
 * cache so an edit invalidates exactly one thumbnail (design.md D8).
 */
export function pageContentHash(
  page: Page,
  objects: Project['objects'],
): string {
  const relevant = page.objectOrder.map((id) => {
    const o = objects[id]
    if (!o) return null
    return objectSignature(o)
  })
  return fnv1a(JSON.stringify(relevant))
}

function objectSignature(o: ImageObject): unknown[] {
  return [
    o.assetId,
    o.x,
    o.y,
    o.width,
    o.height,
    o.rotationDegrees,
    o.flipX,
    o.flipY,
    o.opacity,
    o.crop ? [o.crop.x, o.crop.y, o.crop.width, o.crop.height] : null,
  ]
}

/** FNV-1a 32-bit hash, hex-encoded. Not cryptographic -- just cheap and stable. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}
