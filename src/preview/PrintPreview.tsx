import { useEffect, useMemo, useRef, useState } from 'react'
import { loadImageElement } from '../editor/imageCache'
import {
  bookletPageSize,
  pageRects,
  sheetSizeWithBleed,
  type FlipMode,
  type PaperSize,
} from '../imposition/geometry'
import {
  impose,
  padCount,
  type Sheet,
  type SheetSide,
} from '../imposition/impose'
import type { PageId, Project } from '../model/types'
import type { PixelSize } from '../render/placement'
import { renderPage, type RenderableObject } from '../render/renderPage'
import { useProjectStore } from '../store/projectStore'
import { Checkbox, FIELD_CLASS, Select } from '../ui/fields'
import { cropMarkLines } from './cropMarks'

const PREVIEW_SCALE = 1.2
const FLIP_DURATION_MS = 520

type PreviewMode = 'sheets' | 'assembled'

type SpreadItem =
  | { type: 'single'; pageNumber: number }
  | { type: 'spread'; left: number; right: number }

/**
 * Reading-order layout: the front cover stands alone, then every following
 * pair of pages forms a two-page spread (as they'd face each other once the
 * booklet is open), ending with the back cover alone. `paddedCount` is
 * always an even multiple of 4 (imposition/impose.ts), so this always lands
 * on a lone final page.
 */
function computeSpreads(paddedCount: number): SpreadItem[] {
  if (paddedCount <= 0) return []
  if (paddedCount === 1) return [{ type: 'single', pageNumber: 1 }]
  const items: SpreadItem[] = [{ type: 'single', pageNumber: 1 }]
  for (let p = 2; p < paddedCount; p += 2) {
    items.push({ type: 'spread', left: p, right: p + 1 })
  }
  items.push({ type: 'single', pageNumber: paddedCount })
  return items
}

function pageLabel(pageNumber: number, realPageCount: number): string {
  return pageNumber > realPageCount
    ? 'blank (automatically added)'
    : `page ${pageNumber}`
}

/** Converts a rect in PDF/points space (y-up, origin bottom-left) to canvas pixel space (y-down). */
function toPixelRect(
  rectPt: { x: number; y: number; width: number; height: number },
  canvasHeightPx: number,
) {
  return {
    x: rectPt.x * PREVIEW_SCALE,
    y: canvasHeightPx - (rectPt.y + rectPt.height) * PREVIEW_SCALE,
    width: rectPt.width * PREVIEW_SCALE,
    height: rectPt.height * PREVIEW_SCALE,
  }
}

async function resolvePageRenderable(
  pageNumber: number,
  realPageCount: number,
  pageOrder: PageId[],
  project: Pick<Project, 'pages' | 'objects' | 'assets'>,
): Promise<RenderableObject[]> {
  if (pageNumber > realPageCount) return []
  const pageId = pageOrder[pageNumber - 1]
  const page = pageId ? project.pages[pageId] : undefined
  if (!page) return []

  const renderable: RenderableObject[] = []
  for (const objectId of page.objectOrder) {
    const object = project.objects[objectId]
    const meta = object && project.assets[object.assetId]
    if (!object || !meta) continue
    const image = await loadImageElement(object.assetId)
    renderable.push({
      object,
      image,
      sourceSize: { width: meta.width, height: meta.height },
    })
  }
  return renderable
}

interface PageDataProps {
  paperSize: PaperSize
  bleed: number
  realPageCount: number
  pageOrder: PageId[]
  project: Pick<Project, 'pages' | 'objects' | 'assets'>
}

interface SheetSideCanvasProps extends PageDataProps {
  side: SheetSide
  sideLabel: 'front' | 'back'
  cropMarks: boolean
}

function SheetSideCanvas({
  side,
  sideLabel,
  paperSize,
  bleed,
  cropMarks,
  realPageCount,
  pageOrder,
  project,
}: SheetSideCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const sheetSizePt = useMemo(
    () => sheetSizeWithBleed(paperSize, bleed),
    [paperSize, bleed],
  )
  const canvasSizePx = useMemo<PixelSize>(
    () => ({
      width: sheetSizePt.width * PREVIEW_SCALE,
      height: sheetSizePt.height * PREVIEW_SCALE,
    }),
    [sheetSizePt],
  )
  const rects = useMemo(() => pageRects(paperSize, bleed), [paperSize, bleed])

  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas) return

    async function draw() {
      const ctx = canvas!.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, canvasSizePx.width, canvasSizePx.height)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvasSizePx.width, canvasSizePx.height)

      for (const [pageNumber, rectPt] of [
        [side.left, rects.left],
        [side.right, rects.right],
      ] as const) {
        const renderable = await resolvePageRenderable(
          pageNumber,
          realPageCount,
          pageOrder,
          project,
        )
        if (cancelled) return

        const destPx = toPixelRect(rectPt, canvasSizePx.height)
        ctx.save()
        ctx.translate(destPx.x, destPx.y)
        // Content is allowed to extend past a page's own bounds in the
        // editor (margin-overflow is a warning, not a block) -- clip here so
        // that overflow stays within its own page instead of bleeding into
        // the neighboring page sharing this sheet canvas.
        ctx.beginPath()
        ctx.rect(0, 0, destPx.width, destPx.height)
        ctx.clip()
        renderPage(ctx, renderable, {
          width: destPx.width,
          height: destPx.height,
        })
        ctx.restore()
      }

      if (cropMarks) {
        ctx.save()
        ctx.strokeStyle = '#000000'
        ctx.lineWidth = 1
        for (const line of cropMarkLines(rects)) {
          const p1 = {
            x: line.x1 * PREVIEW_SCALE,
            y: canvasSizePx.height - line.y1 * PREVIEW_SCALE,
          }
          const p2 = {
            x: line.x2 * PREVIEW_SCALE,
            y: canvasSizePx.height - line.y2 * PREVIEW_SCALE,
          }
          ctx.beginPath()
          ctx.moveTo(p1.x, p1.y)
          ctx.lineTo(p2.x, p2.y)
          ctx.stroke()
        }
        ctx.restore()
      }
    }

    void draw()
    return () => {
      cancelled = true
    }
  }, [side, canvasSizePx, rects, cropMarks, realPageCount, pageOrder, project])

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex w-full justify-between text-xs text-neutral-500">
        <span className="capitalize">{sideLabel}</span>
      </div>
      <canvas
        ref={canvasRef}
        width={canvasSizePx.width}
        height={canvasSizePx.height}
        style={{ width: '100%', maxWidth: 480, border: '1px solid #cbd5e1' }}
      />
      <div className="flex w-full justify-between text-[11px] text-neutral-500">
        <span>{pageLabel(side.left, realPageCount)}</span>
        <span>{pageLabel(side.right, realPageCount)}</span>
      </div>
    </div>
  )
}

interface PageCanvasProps extends PageDataProps {
  pageNumber: number
  maxWidth: number
}

/** Renders a single booklet page at its own trim size -- used by the assembled/reading-order view. */
function PageCanvas({
  pageNumber,
  paperSize,
  bleed,
  realPageCount,
  pageOrder,
  project,
  maxWidth,
}: PageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const pageSizePt = useMemo(() => {
    const base = bookletPageSize(paperSize)
    return { width: base.width + 2 * bleed, height: base.height + 2 * bleed }
  }, [paperSize, bleed])
  const canvasSizePx = useMemo<PixelSize>(
    () => ({
      width: pageSizePt.width * PREVIEW_SCALE,
      height: pageSizePt.height * PREVIEW_SCALE,
    }),
    [pageSizePt],
  )

  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas) return

    async function draw() {
      const ctx = canvas!.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, canvasSizePx.width, canvasSizePx.height)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvasSizePx.width, canvasSizePx.height)

      const renderable = await resolvePageRenderable(
        pageNumber,
        realPageCount,
        pageOrder,
        project,
      )
      if (cancelled) return

      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, canvasSizePx.width, canvasSizePx.height)
      ctx.clip()
      renderPage(ctx, renderable, canvasSizePx)
      ctx.restore()
    }

    void draw()
    return () => {
      cancelled = true
    }
  }, [pageNumber, canvasSizePx, realPageCount, pageOrder, project])

  return (
    <canvas
      ref={canvasRef}
      width={canvasSizePx.width}
      height={canvasSizePx.height}
      style={{ width: '100%', maxWidth, border: '1px solid #cbd5e1' }}
    />
  )
}

interface SpreadViewProps extends PageDataProps {
  spread: SpreadItem
}

function SpreadView({ spread, realPageCount, ...pageData }: SpreadViewProps) {
  if (spread.type === 'single') {
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs text-neutral-500">
          {spread.pageNumber === 1
            ? 'front cover'
            : pageLabel(spread.pageNumber, realPageCount)}
        </span>
        <PageCanvas
          pageNumber={spread.pageNumber}
          realPageCount={realPageCount}
          maxWidth={320}
          {...pageData}
        />
      </div>
    )
  }

  return (
    <div className="flex items-start">
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs text-neutral-500">
          {pageLabel(spread.left, realPageCount)}
        </span>
        <PageCanvas
          pageNumber={spread.left}
          realPageCount={realPageCount}
          maxWidth={320}
          {...pageData}
        />
      </div>
      <div className="relative w-2 self-stretch">
        <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-black/15 via-transparent to-black/15" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs text-neutral-500">
          {pageLabel(spread.right, realPageCount)}
        </span>
        <PageCanvas
          pageNumber={spread.right}
          realPageCount={realPageCount}
          maxWidth={320}
          {...pageData}
        />
      </div>
    </div>
  )
}

export default function PrintPreview({ onClose }: { onClose?: () => void }) {
  const project = useProjectStore((s) => s.project)
  const updateSettings = useProjectStore((s) => s.updateSettings)

  const [mode, setMode] = useState<PreviewMode>('sheets')

  const { paperSize, bleed, cropMarks, flipMode } = project.settings
  const realPageCount = project.pageOrder.length
  const paddedCount = padCount(realPageCount)

  const sheets = useMemo<Sheet[]>(
    () => impose(paddedCount, flipMode),
    [paddedCount, flipMode],
  )
  const [sheetIndex, setSheetIndex] = useState(0)
  const clampedSheetIndex = Math.min(sheetIndex, sheets.length - 1)
  const currentSheet = sheets[clampedSheetIndex]

  const spreads = useMemo(() => computeSpreads(paddedCount), [paddedCount])
  const [spreadIndex, setSpreadIndex] = useState(0)
  const clampedSpreadIndex = Math.min(
    spreadIndex,
    Math.max(0, spreads.length - 1),
  )
  const currentSpread = spreads[clampedSpreadIndex]

  // The outgoing spread is kept mounted in an absolutely-positioned overlay
  // just long enough to animate a page-turn over the newly active spread,
  // which is already rendered underneath.
  const [flipLayer, setFlipLayer] = useState<{
    key: number
    spread: SpreadItem
    direction: 'next' | 'prev'
  } | null>(null)
  const flipKeyRef = useRef(0)
  const flipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (flipTimeoutRef.current) clearTimeout(flipTimeoutRef.current)
    },
    [],
  )

  function goToSpread(nextIndex: number, direction: 'next' | 'prev') {
    const outgoing = spreads[clampedSpreadIndex]
    if (!outgoing || nextIndex === clampedSpreadIndex) return
    if (flipTimeoutRef.current) clearTimeout(flipTimeoutRef.current)
    flipKeyRef.current += 1
    setFlipLayer({ key: flipKeyRef.current, spread: outgoing, direction })
    setSpreadIndex(nextIndex)
    flipTimeoutRef.current = setTimeout(
      () => setFlipLayer(null),
      FLIP_DURATION_MS,
    )
  }

  const pageData: PageDataProps = {
    paperSize,
    bleed,
    realPageCount,
    pageOrder: project.pageOrder,
    project,
  }

  return (
    <div className="flex h-full flex-col bg-neutral-0">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
        <h2 className="text-sm font-medium text-neutral-900">Print Preview</h2>
        <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
          <button
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              mode === 'sheets'
                ? 'bg-accent-600 text-white'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
            onClick={() => setMode('sheets')}
            aria-pressed={mode === 'sheets'}
          >
            Sheets
          </button>
          <button
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              mode === 'assembled'
                ? 'bg-accent-600 text-white'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
            onClick={() => setMode('assembled')}
            aria-pressed={mode === 'assembled'}
          >
            Assembled
          </button>
        </div>
        {onClose && (
          <button
            className="rounded-md px-2 py-1 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            onClick={onClose}
          >
            Close
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-4 border-b border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Paper</span>
          <Select
            className="w-28"
            value={paperSize}
            onChange={(e) =>
              updateSettings({ paperSize: e.target.value as PaperSize })
            }
          >
            <option value="letter">Letter</option>
            <option value="a4">A4</option>
            <option value="legal">Legal</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Bleed (pt)</span>
          <input
            type="number"
            min={0}
            className={`${FIELD_CLASS} w-20 text-right`}
            value={bleed}
            onChange={(e) => updateSettings({ bleed: Number(e.target.value) })}
          />
        </label>
        {mode === 'sheets' && (
          <>
            <label className="flex items-center gap-1.5 pb-1.5">
              <Checkbox
                checked={cropMarks}
                onChange={(e) =>
                  updateSettings({ cropMarks: e.target.checked })
                }
              />
              <span className="text-neutral-700">Crop marks</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-500">Duplex flip mode</span>
              <Select
                className="w-44"
                value={flipMode}
                onChange={(e) =>
                  updateSettings({ flipMode: e.target.value as FlipMode })
                }
              >
                <option value="vertical-axis">Vertical axis (default)</option>
                <option value="horizontal-axis">Horizontal axis</option>
              </Select>
            </label>
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 border-b border-neutral-200 px-3 py-2 text-sm">
        {mode === 'sheets' ? (
          <>
            <button
              className="rounded-md px-2.5 py-1 text-neutral-700 transition-colors hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
              onClick={() => setSheetIndex((i) => Math.max(0, i - 1))}
              disabled={clampedSheetIndex === 0}
            >
              ← Prev sheet
            </button>
            <span className="text-neutral-600">
              Sheet {clampedSheetIndex + 1} of {sheets.length}
            </span>
            <button
              className="rounded-md px-2.5 py-1 text-neutral-700 transition-colors hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
              onClick={() =>
                setSheetIndex((i) => Math.min(sheets.length - 1, i + 1))
              }
              disabled={clampedSheetIndex === sheets.length - 1}
            >
              Next sheet →
            </button>
          </>
        ) : (
          <>
            <button
              className="rounded-md px-2.5 py-1 text-neutral-700 transition-colors hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
              onClick={() =>
                goToSpread(Math.max(0, clampedSpreadIndex - 1), 'prev')
              }
              disabled={clampedSpreadIndex === 0}
            >
              ← Prev
            </button>
            <span className="text-neutral-600">
              {clampedSpreadIndex === 0
                ? 'Front cover'
                : clampedSpreadIndex === spreads.length - 1
                  ? 'Back cover'
                  : `Spread ${clampedSpreadIndex + 1} of ${spreads.length}`}
            </span>
            <button
              className="rounded-md px-2.5 py-1 text-neutral-700 transition-colors hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
              onClick={() =>
                goToSpread(
                  Math.min(spreads.length - 1, clampedSpreadIndex + 1),
                  'next',
                )
              }
              disabled={clampedSpreadIndex === spreads.length - 1}
            >
              Next →
            </button>
          </>
        )}
      </div>

      {mode === 'sheets' && currentSheet && (
        <div className="flex flex-1 flex-wrap items-start justify-center gap-6 overflow-auto p-4">
          <SheetSideCanvas
            side={currentSheet.front}
            sideLabel="front"
            cropMarks={cropMarks}
            {...pageData}
          />
          <SheetSideCanvas
            side={currentSheet.back}
            sideLabel="back"
            cropMarks={cropMarks}
            {...pageData}
          />
        </div>
      )}

      {mode === 'assembled' && currentSpread && (
        <div className="page-flip-perspective relative flex flex-1 items-start justify-center overflow-auto p-6">
          <SpreadView spread={currentSpread} {...pageData} />
          {flipLayer && (
            <div
              key={flipLayer.key}
              className={`page-flip-layer ${flipLayer.direction} absolute inset-0 z-10 flex items-start justify-center bg-neutral-0 p-6`}
            >
              <SpreadView spread={flipLayer.spread} {...pageData} />
            </div>
          )}
        </div>
      )}

      <div className="border-t border-neutral-200 px-3 py-2 text-xs text-neutral-500">
        {mode === 'sheets' ? (
          <>
            Print double-sided using{' '}
            <strong>
              {flipMode === 'vertical-axis'
                ? 'vertical-axis (short-edge)'
                : 'horizontal-axis (long-edge)'}
            </strong>{' '}
            duplex, keep sheets in this order, fold the stack once down the
            center, and check against sheet 1.
          </>
        ) : (
          <>
            This is the reading order once the booklet is folded and stitched --
            not the sheet order used for printing. Switch to Sheets to see how
            pages are imposed for your printer.
          </>
        )}
      </div>
    </div>
  )
}
