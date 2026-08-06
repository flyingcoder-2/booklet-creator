import { useState } from 'react'
import { findLowDpiPlacements } from '../export/dpiCheck'
import {
  exportBookletPdf,
  generateDuplexTestSheet,
} from '../export/exportBookletPdf'
import { exportPagesAsZip, type RasterFormat } from '../export/rasterExport'
import {
  bookletPageSize,
  type FlipMode,
  type PaperSize,
} from '../imposition/geometry'
import { padCount } from '../imposition/impose'
import { useProjectStore } from '../store/projectStore'
import { Checkbox, FIELD_CLASS, Select } from '../ui/fields'

const CREEP_WARNING_SHEET_THRESHOLD = 10 // ~40 pages / 4

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function FieldRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="grid grid-cols-[1fr_7rem] items-center gap-2">
      <span className="text-neutral-600">{label}</span>
      {children}
    </label>
  )
}

export default function RightPanel({
  onOpenPreview,
}: {
  onOpenPreview: () => void
}) {
  const project = useProjectStore((s) => s.project)
  const updateSettings = useProjectStore((s) => s.updateSettings)
  const [status, setStatus] = useState<string | null>(null)
  const [rasterFormat, setRasterFormat] = useState<RasterFormat>('png')

  const { paperSize, margins, bleed, cropMarks, flipMode } = project.settings
  const realPageCount = project.pageOrder.length
  const sheetCount = padCount(realPageCount) / 4

  async function handleGenerateBooklet() {
    const lowDpi = findLowDpiPlacements(project, bookletPageSize(paperSize))
    if (lowDpi.length > 0) {
      const pageNumbers = [...new Set(lowDpi.map((p) => p.pageNumber))].join(
        ', ',
      )
      const proceed = window.confirm(
        `Some images are below 300 DPI at their current size (pages ${pageNumbers}). Continue export anyway?`,
      )
      if (!proceed) return
    }

    setStatus('exporting...')
    try {
      let bytes: Uint8Array | null = null
      for await (const event of exportBookletPdf(project)) {
        if (event.type === 'progress') {
          setStatus(`side ${event.completedSides}/${event.totalSides}`)
        } else {
          bytes = event.bytes
        }
      }
      if (bytes) {
        downloadBlob(
          new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
          'booklet.pdf',
        )
        setStatus('done')
      }
    } catch (err) {
      setStatus(`error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleExportPages() {
    setStatus('exporting pages...')
    try {
      const zip = await exportPagesAsZip(project, {
        format: rasterFormat,
        dpi: 300,
        jpegQuality: 0.92,
      })
      downloadBlob(zip, `booklet-pages-${rasterFormat}.zip`)
      setStatus('done')
    } catch (err) {
      setStatus(`error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleTestSheet() {
    setStatus('generating test sheet...')
    try {
      const bytes = await generateDuplexTestSheet(project)
      downloadBlob(
        new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
        'duplex-test-sheet.pdf',
      )
      setStatus('done')
    } catch (err) {
      setStatus(`error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="flex w-[var(--spacing-panel-w)] shrink-0 flex-col divide-y divide-neutral-100 overflow-y-auto border-l border-neutral-200 bg-neutral-0 text-sm">
      <section className="flex flex-col gap-2 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Export
        </h3>
        <div className="flex flex-col gap-1.5">
          <button
            className="rounded-lg bg-accent-600 px-2.5 py-1.5 text-left font-medium text-white shadow-sm transition-colors hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
            onClick={handleGenerateBooklet}
          >
            Generate Booklet (PDF)
          </button>
          <button
            className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-left text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            onClick={onOpenPreview}
          >
            Print Preview
          </button>
          <button
            className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-left text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            onClick={handleTestSheet}
          >
            Duplex Test Sheet
          </button>
          <div className="flex items-center gap-1.5">
            <Select
              className="w-[5.5rem] flex-none"
              value={rasterFormat}
              onChange={(e) => setRasterFormat(e.target.value as RasterFormat)}
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
            </Select>
            <button
              className="flex-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
              onClick={handleExportPages}
            >
              Export Pages (ZIP)
            </button>
          </div>
          {status && (
            <span className="text-xs text-neutral-500" role="status">
              {status}
            </span>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2.5 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Project Settings
        </h3>
        <div className="flex flex-col gap-2.5">
          <FieldRow label="Paper">
            <Select
              value={paperSize}
              onChange={(e) =>
                updateSettings({ paperSize: e.target.value as PaperSize })
              }
            >
              <option value="letter">Letter</option>
              <option value="a4">A4</option>
              <option value="legal">Legal</option>
            </Select>
          </FieldRow>
          <FieldRow label="Margin (pt)">
            <input
              type="number"
              min={0}
              className={`${FIELD_CLASS} text-right`}
              value={margins.top}
              onChange={(e) => {
                const v = Number(e.target.value)
                updateSettings({
                  margins: { top: v, right: v, bottom: v, left: v },
                })
              }}
            />
          </FieldRow>
          <FieldRow label="Bleed (pt)">
            <input
              type="number"
              min={0}
              className={`${FIELD_CLASS} text-right`}
              value={bleed}
              onChange={(e) =>
                updateSettings({ bleed: Number(e.target.value) })
              }
            />
          </FieldRow>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-600">Crop marks</span>
            <Checkbox
              checked={cropMarks}
              onChange={(e) => updateSettings({ cropMarks: e.target.checked })}
            />
          </label>
          <FieldRow label="Duplex flip">
            <Select
              value={flipMode}
              onChange={(e) =>
                updateSettings({ flipMode: e.target.value as FlipMode })
              }
            >
              <option value="vertical-axis">Vertical axis</option>
              <option value="horizontal-axis">Horizontal axis</option>
            </Select>
          </FieldRow>
        </div>
      </section>

      <section className="p-3 text-xs text-neutral-500">
        <p>
          {realPageCount} page{realPageCount === 1 ? '' : 's'} · {sheetCount}{' '}
          sheet
          {sheetCount === 1 ? '' : 's'}
        </p>
        {sheetCount > CREEP_WARNING_SHEET_THRESHOLD && (
          <p className="mt-2 rounded-lg border border-warning-500/30 bg-warning-50 p-2 text-warning-700">
            Booklets over roughly 40 pages accumulate binding creep (inner pages
            shift slightly toward the spine after folding) that this app does
            not compensate for. Content near the inner margin may sit closer to
            the fold than designed.
          </p>
        )}
      </section>
    </div>
  )
}
