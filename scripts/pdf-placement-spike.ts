/**
 * Standalone spike (tasks 3.1-3.2): proves the raw-operator placement approach
 * from design.md D5 — full affine transform (translate/rotate/scale/flip) via
 * `concatTransformationMatrix`, clipped to a booklet-page rect via `re`/`W`/`n`
 * so nothing crosses the fold line — before any export UI is built on top of it.
 *
 * Run with: npm run spike:pdf
 * Output:   scripts/output/placement-spike.pdf
 *
 * This script only proves the code path renders something plausible. Per
 * task 3.3, the output still needs eyeballing in real PDF viewers (and
 * ultimately a real duplex print) to confirm rotation direction, flip
 * handedness, and clipping are actually correct — not just "didn't throw."
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import {
  slotRects,
  uniformMargins,
  type PaperSize,
} from '../src/imposition/geometry'
import { drawPlacedImage } from '../src/pdf/placeImage'
import { makeOrientationTestPng } from './lib/test-pattern'

const IMAGE_ASPECT = 560 / 400

async function main() {
  const paperSize: PaperSize = 'letter'
  const margins = uniformMargins(24)
  const { left, right } = slotRects(paperSize, margins, 0)

  const testPng = makeOrientationTestPng(400, 560)

  const pdfDoc = await PDFDocument.create()
  const image = await pdfDoc.embedPng(testPng)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  function drawGuides(page: import('pdf-lib').PDFPage) {
    page.drawLine({
      start: { x: 396, y: 0 },
      end: { x: 396, y: 612 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
      dashArray: [4, 4],
    })
    for (const rect of [left, right]) {
      page.drawRectangle({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        borderColor: rgb(0.8, 0.8, 0.95),
        borderWidth: 0.5,
      })
    }
  }

  function fitted(rect: {
    x: number
    y: number
    width: number
    height: number
  }) {
    const width = rect.width
    const height = width * IMAGE_ASPECT
    return { x: rect.x, y: rect.y + (rect.height - height) / 2, width, height }
  }

  function label(page: import('pdf-lib').PDFPage, text: string, y: number) {
    page.drawText(text, { x: 24, y, size: 7, font, color: rgb(0.2, 0.2, 0.2) })
  }

  // Page 1: combined affine transform (task 3.1) + oversized-and-clipped (task 3.2).
  const page1 = pdfDoc.addPage([792, 612])
  drawGuides(page1)

  const oversizedWidth = left.width * 1.6
  const oversizedHeight = oversizedWidth * IMAGE_ASPECT
  drawPlacedImage(
    page1,
    image,
    {
      rect: {
        x: left.x + left.width / 2 - oversizedWidth / 2,
        y: left.y + left.height / 2 - oversizedHeight / 2,
        width: oversizedWidth,
        height: oversizedHeight,
      },
      rotationDegrees: 25,
      flipX: true,
      flipY: false,
    },
    left,
  )
  drawPlacedImage(page1, image, { rect: fitted(right) }, right)

  label(
    page1,
    'LEFT: rotated 25 CW, flip-X, oversized -- must be clipped to the blue box, must not cross the dashed fold line',
    592,
  )
  label(page1, 'RIGHT: control -- upright, unflipped, fits exactly', 580)

  // Page 2: rotation and flip in isolation, so each is checkable on its own
  // rather than only in combination.
  const page2 = pdfDoc.addPage([792, 612])
  drawGuides(page2)

  drawPlacedImage(
    page2,
    image,
    { rect: fitted(left), rotationDegrees: 90 },
    left,
  )
  drawPlacedImage(page2, image, { rect: fitted(right), flipX: true }, right)

  label(page2, 'LEFT: rotate 90 CW only, no flip', 592)
  label(page2, 'RIGHT: flip-X only, no rotation', 580)

  const outDir = path.resolve(import.meta.dirname, 'output')
  await mkdir(outDir, { recursive: true })
  const outPath = path.join(outDir, 'placement-spike.pdf')
  await writeFile(outPath, await pdfDoc.save())

  console.log(`Wrote ${outPath}`)
  console.log('Open it in a PDF viewer and check:')
  console.log('Page 1:')
  console.log(
    '  - left F is rotated clockwise and mirrored, clipped to its blue box',
  )
  console.log(
    '  - nothing from the left placement crosses the dashed fold line',
  )
  console.log(
    '  - right F is upright, unflipped, unclipped (fits with room to spare)',
  )
  console.log('Page 2:')
  console.log(
    '  - left F is rotated 90 degrees clockwise as a rigid body (not mirrored)',
  )
  console.log('  - right F is mirrored left-right (not rotated)')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
