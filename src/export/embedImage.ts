import { PDFDocument, type PDFImage } from 'pdf-lib'
import { getAssetBytes } from '../assets/assetStore'
import type { AssetId, AssetMeta, CropRect } from '../model/types'
import { cropToSourcePixelRect } from '../render/placement'
import { isFullCrop } from '../editor/fabricAdapter'

/**
 * Embeds each distinct (asset, crop) pair exactly once per export run and
 * reuses the handle across every placement that references it (export spec
 * D5/9.2), and bakes non-full crops into a real cropped bitmap on demand,
 * cached by a key derived from the asset id and crop rect (design.md D6) --
 * PDF image drawing has no source-rectangle parameter, so a crop can't be
 * expressed as a draw-time transform the way rotation and scale can.
 */
export class ImageEmbedder {
  private readonly wholeImageCache = new Map<AssetId, PDFImage>()
  private readonly bakedCropCache = new Map<string, PDFImage>()
  private readonly pdfDoc: PDFDocument

  constructor(pdfDoc: PDFDocument) {
    this.pdfDoc = pdfDoc
  }

  async getEmbeddedImage(
    assetId: AssetId,
    assetMeta: AssetMeta,
    crop: CropRect | undefined,
  ): Promise<PDFImage> {
    if (isFullCrop(crop)) {
      const cached = this.wholeImageCache.get(assetId)
      if (cached) return cached
      const blob = await this.readAssetBytes(assetId)
      const image = await this.embedBytes(blob, assetMeta.mimeType)
      this.wholeImageCache.set(assetId, image)
      return image
    }

    const key = cropCacheKey(assetId, crop!)
    const cached = this.bakedCropCache.get(key)
    if (cached) return cached

    const image = await this.bakeCrop(assetId, assetMeta, crop!)
    this.bakedCropCache.set(key, image)
    return image
  }

  private async readAssetBytes(assetId: AssetId): Promise<Blob> {
    const blob = await getAssetBytes(assetId)
    if (!blob) throw new Error(`Missing asset bytes for ${assetId}`)
    return blob
  }

  private async embedBytes(
    blob: Blob,
    mimeType: AssetMeta['mimeType'],
  ): Promise<PDFImage> {
    if (mimeType === 'image/jpeg')
      return this.pdfDoc.embedJpg(new Uint8Array(await blob.arrayBuffer()))
    if (mimeType === 'image/png')
      return this.pdfDoc.embedPng(new Uint8Array(await blob.arrayBuffer()))
    // pdf-lib has no native WebP embed -- transcode to PNG (lossless) first.
    const pngBytes = await transcodeToPng(blob)
    return this.pdfDoc.embedPng(pngBytes)
  }

  private async bakeCrop(
    assetId: AssetId,
    assetMeta: AssetMeta,
    crop: CropRect,
  ): Promise<PDFImage> {
    const blob = await this.readAssetBytes(assetId)
    const bitmap = await createImageBitmap(blob)
    const cropPx = cropToSourcePixelRect(crop, {
      width: bitmap.width,
      height: bitmap.height,
    })
    const width = Math.max(1, Math.round(cropPx.width))
    const height = Math.max(1, Math.round(cropPx.height))

    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('bakeCrop: could not acquire a 2D canvas context')
    ctx.drawImage(
      bitmap,
      cropPx.x,
      cropPx.y,
      cropPx.width,
      cropPx.height,
      0,
      0,
      width,
      height,
    )
    bitmap.close()

    // PNG source stays lossless; anything else re-encodes as high-quality JPEG.
    const isPng = assetMeta.mimeType === 'image/png'
    const outBlob = await canvas.convertToBlob(
      isPng ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.92 },
    )
    const outBytes = new Uint8Array(await outBlob.arrayBuffer())
    return isPng
      ? this.pdfDoc.embedPng(outBytes)
      : this.pdfDoc.embedJpg(outBytes)
  }
}

function cropCacheKey(assetId: AssetId, crop: CropRect): string {
  return `${assetId}:${crop.x},${crop.y},${crop.width},${crop.height}`
}

async function transcodeToPng(blob: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')
  if (!ctx)
    throw new Error('transcodeToPng: could not acquire a 2D canvas context')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const pngBlob = await canvas.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await pngBlob.arrayBuffer())
}
