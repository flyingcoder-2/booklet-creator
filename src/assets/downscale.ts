import { bookletPageSize, type PaperSize } from '../imposition/geometry'

const POINTS_PER_INCH = 72
const FULL_PAGE_PRINT_DPI = 300

/** Pixel ceiling for a full-page 300 DPI print of the given paper size's booklet page. */
export function printCeilingPx(paperSize: PaperSize): {
  width: number
  height: number
} {
  const page = bookletPageSize(paperSize)
  return {
    width: Math.round((page.width / POINTS_PER_INCH) * FULL_PAGE_PRINT_DPI),
    height: Math.round((page.height / POINTS_PER_INCH) * FULL_PAGE_PRINT_DPI),
  }
}

export interface DownscaleResult {
  blob: Blob
  width: number
  height: number
  /** True if the source was already within the ceiling and was returned unchanged. */
  unchanged: boolean
}

/**
 * Downscales `source` to fit within `ceiling` if it exceeds it, using
 * `createImageBitmap` + `OffscreenCanvas` (design.md D4). Images already
 * within the ceiling are returned unchanged so re-encoding never degrades
 * an image that didn't need it.
 */
export async function downscaleToCeiling(
  source: Blob,
  ceiling: { width: number; height: number },
): Promise<DownscaleResult> {
  const bitmap = await createImageBitmap(source)

  if (bitmap.width <= ceiling.width && bitmap.height <= ceiling.height) {
    const { width, height } = bitmap
    bitmap.close() // must close after reading width/height -- closing zeroes them
    return { blob: source, width, height, unchanged: true }
  }

  const scale = Math.min(
    ceiling.width / bitmap.width,
    ceiling.height / bitmap.height,
  )
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx)
    throw new Error('downscaleToCeiling: could not acquire a 2D canvas context')

  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const outputType = source.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
  const blob = await canvas.convertToBlob({ type: outputType })

  return { blob, width, height, unchanged: false }
}
