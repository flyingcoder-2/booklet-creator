import { printCeilingPx } from '../assets/downscale'
import type { PaperSize } from '../imposition/geometry'

/**
 * pdf.js renders a page at `scale` x its intrinsic point size. Pick the scale
 * that makes the rasterized page at least as large as a full-page 300 DPI
 * print for this paper size (design.md D3), so a page placed at full size has
 * print-adequate resolution and never triggers the export DPI warning on
 * account of the import step.
 *
 * The scale is never reduced below 1: shrinking below the PDF's own intrinsic
 * size would throw away detail the source actually had. Anything larger than
 * the ceiling is clamped afterwards by `importImage`'s downscale, so this
 * function is only ever asked "how big must it be", never "how big may it be".
 */
export function renderScaleForPaper(
  pageViewportPt: { width: number; height: number },
  paperSize: PaperSize,
): number {
  const ceiling = printCeilingPx(paperSize)

  if (pageViewportPt.width <= 0 || pageViewportPt.height <= 0) return 1

  const scale = Math.max(
    ceiling.width / pageViewportPt.width,
    ceiling.height / pageViewportPt.height,
  )

  return Math.max(1, scale)
}
