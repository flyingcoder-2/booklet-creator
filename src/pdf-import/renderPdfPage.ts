import type { PdfPageLike } from './pdfDocument'

/**
 * Rasterizes one PDF page to a PNG blob at `scale`. The canvas is sized to the
 * scaled viewport and released as soon as the blob exists, so a long import
 * holds at most one page's pixels at a time (design.md D5).
 */
export async function renderPdfPageToBlob(
  page: PdfPageLike,
  scale: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const viewport = page.getViewport({ scale })
  const width = Math.max(1, Math.floor(viewport.width))
  const height = Math.max(1, Math.floor(viewport.height))

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error(
      'renderPdfPageToBlob: could not acquire a 2D canvas context',
    )
  }

  // PDF pages composite onto white -- without this, transparent regions would
  // become black once flattened into a PNG.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  try {
    await page.render({ canvasContext: ctx, viewport }).promise
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return { blob, width, height }
  } finally {
    // Dropping the backing store keeps peak memory to one page.
    canvas.width = 0
    canvas.height = 0
    page.cleanup?.()
  }
}
