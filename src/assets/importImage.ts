import type { PaperSize } from '../imposition/geometry'
import type { AssetId, AssetMeta } from '../model/types'
import { putAssetBytes } from './assetStore'
import { downscaleToCeiling, printCeilingPx } from './downscale'
import { sha256Hex } from './hash'

const SUPPORTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export function isSupportedImageType(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.has(mimeType)
}

export interface ImportedImage {
  assetId: AssetId
  meta: Omit<AssetMeta, 'id' | 'refCount'>
}

/**
 * Decodes, downscales to the paper size's 300 DPI full-page ceiling (design.md
 * D4), hashes, and stores the resulting bytes in IndexedDB, keyed by content
 * hash so identical images (including duplicated pages) are stored once.
 */
export async function importImage(
  file: Blob,
  paperSize: PaperSize,
): Promise<ImportedImage> {
  if (!isSupportedImageType(file.type)) {
    throw new Error(`Unsupported image type: ${file.type || 'unknown'}`)
  }

  const ceiling = printCeilingPx(paperSize)
  const { blob, width, height } = await downscaleToCeiling(file, ceiling)
  const bytes = await blob.arrayBuffer()
  const assetId = await sha256Hex(bytes)

  await putAssetBytes(assetId, blob)

  return {
    assetId,
    meta: {
      width,
      height,
      mimeType: (blob.type || file.type) as AssetMeta['mimeType'],
      byteLength: bytes.byteLength,
    },
  }
}
