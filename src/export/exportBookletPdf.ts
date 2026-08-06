import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import {
  pageRects,
  sheetSizeWithBleed,
  slotRects,
  type Rect,
} from '../imposition/geometry'
import {
  impose,
  padCount,
  sidesInOutputOrder,
  type OutputSide,
} from '../imposition/impose'
import type { Project } from '../model/types'
import { drawPlacedImage } from '../pdf/placeImage'
import { cropMarkLines } from '../preview/cropMarks'
import { ImageEmbedder } from './embedImage'
import { computePdfPlacement } from './pdfPlacement'

export type ExportEvent =
  | { type: 'progress'; completedSides: number; totalSides: number }
  | { type: 'done'; bytes: Uint8Array }

export class ExportAbortedError extends Error {
  constructor() {
    super('Export was cancelled')
    this.name = 'ExportAbortedError'
  }
}

function checkAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new ExportAbortedError()
}

async function drawSide(
  page: import('pdf-lib').PDFPage,
  side: OutputSide,
  project: Pick<Project, 'pageOrder' | 'pages' | 'objects' | 'assets'>,
  realPageCount: number,
  pageRectsBySlot: { left: Rect; right: Rect },
  clipRectsBySlot: { left: Rect; right: Rect },
  embedder: ImageEmbedder,
): Promise<void> {
  const slots: Array<['left' | 'right', number]> = [
    ['left', side.slots.left],
    ['right', side.slots.right],
  ]

  for (const [slotKey, pageNumber] of slots) {
    if (pageNumber > realPageCount) continue // padded blank: render nothing (spec "Blank slot rendering")

    const pageId = project.pageOrder[pageNumber - 1]
    const bookletPage = pageId ? project.pages[pageId] : undefined
    if (!bookletPage) continue

    const rectPt = pageRectsBySlot[slotKey]
    const clipRect = clipRectsBySlot[slotKey]

    for (const objectId of bookletPage.objectOrder) {
      const object = project.objects[objectId]
      const assetMeta = object && project.assets[object.assetId]
      if (!object || !assetMeta) continue

      const image = await embedder.getEmbeddedImage(
        object.assetId,
        assetMeta,
        object.crop,
      )
      const placement = computePdfPlacement(object, rectPt)
      drawPlacedImage(page, image, placement, clipRect)
    }
  }
}

function drawCropMarksOnPage(
  page: import('pdf-lib').PDFPage,
  rects: { left: Rect; right: Rect },
): void {
  for (const line of cropMarkLines(rects)) {
    page.drawLine({
      start: { x: line.x1, y: line.y1 },
      end: { x: line.x2, y: line.y2 },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    })
  }
}

/**
 * Builds the imposed, print-ready PDF as an async generator over output
 * sides (design.md D12): yields progress after each side and honours
 * `signal` for cancellation, so a 200-page export keeps the tab responsive
 * and can be stopped without downloading anything (export spec "Export
 * progress and memory behaviour").
 */
export async function* exportBookletPdf(
  project: Pick<
    Project,
    'pageOrder' | 'pages' | 'objects' | 'assets' | 'settings'
  >,
  options: { signal?: AbortSignal } = {},
): AsyncGenerator<ExportEvent, void, void> {
  const { paperSize, margins, bleed, cropMarks, flipMode } = project.settings
  const realPageCount = project.pageOrder.length
  const paddedCount = padCount(realPageCount)
  const sheets = impose(paddedCount, flipMode)
  const sides = sidesInOutputOrder(sheets)

  const sheetSize = sheetSizeWithBleed(paperSize, bleed)
  const rects = pageRects(paperSize, bleed)
  const clipRects = slotRects(paperSize, margins, bleed)

  const pdfDoc = await PDFDocument.create()
  const embedder = new ImageEmbedder(pdfDoc)

  for (let i = 0; i < sides.length; i++) {
    checkAborted(options.signal)

    const page = pdfDoc.addPage([sheetSize.width, sheetSize.height])
    await drawSide(
      page,
      sides[i],
      project,
      realPageCount,
      rects,
      clipRects,
      embedder,
    )
    if (cropMarks) drawCropMarksOnPage(page, rects)

    checkAborted(options.signal)
    // Yield to the event loop between sides so the tab stays responsive.
    await new Promise((resolve) => setTimeout(resolve, 0))

    yield { type: 'progress', completedSides: i + 1, totalSides: sides.length }
  }

  checkAborted(options.signal)
  const bytes = await pdfDoc.save()
  yield { type: 'done', bytes }
}

/**
 * A minimal one-sheet duplex test print (export spec "Test sheet for printer
 * verification"): front and back, slots labelled with their intended page
 * number and side, plus fold/print instructions -- lets a user confirm their
 * printer's duplex flip behaviour on one sheet before committing a long job.
 */
export async function generateDuplexTestSheet(
  project: Pick<Project, 'settings'>,
): Promise<Uint8Array> {
  const { paperSize, bleed, flipMode } = project.settings
  const sheetSize = sheetSizeWithBleed(paperSize, bleed)
  const rects = pageRects(paperSize, bleed)

  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const testSheet = impose(4, flipMode)[0]

  for (const [side, sideLabel] of [
    [testSheet.front, 'FRONT'],
    [testSheet.back, 'BACK'],
  ] as const) {
    const page = pdfDoc.addPage([sheetSize.width, sheetSize.height])
    for (const [slotKey, pageNumber] of [
      ['left', side.left],
      ['right', side.right],
    ] as const) {
      const rect = rects[slotKey]
      page.drawRectangle({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 1,
      })
      page.drawText(`Page ${pageNumber}`, {
        x: rect.x + rect.width / 2 - 30,
        y: rect.y + rect.height / 2,
        size: 18,
        font,
        color: rgb(0, 0, 0),
      })
      page.drawText(sideLabel, {
        x: rect.x + 12,
        y: rect.y + rect.height - 24,
        size: 10,
        font,
        color: rgb(0.4, 0.4, 0.4),
      })
    }
    page.drawText(
      'Duplex test sheet: print double-sided, fold once down the center. Folded, this should read Page 1, 2, 3, 4 in order.',
      { x: 12, y: 12, size: 8, font, color: rgb(0.4, 0.4, 0.4) },
    )
  }

  return pdfDoc.save()
}
