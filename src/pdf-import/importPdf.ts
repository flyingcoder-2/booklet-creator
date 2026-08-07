import { deleteAssetBytes } from '../assets/assetStore'
import { importImage } from '../assets/importImage'
import { bookletPageSize, type PaperSize } from '../imposition/geometry'
import type { AssetId, AssetMeta, ImageObject } from '../model/types'
import { fitToPageFraction } from '../render/placement'
import { openPdfDocument } from './pdfDocument'
import { renderPdfPageToBlob } from './renderPdfPage'
import { renderScaleForPaper } from './renderScale'

export const PDF_MIME_TYPE = 'application/pdf'

export function isPdfFile(file: { type: string; name?: string }): boolean {
  if (file.type === PDF_MIME_TYPE) return true
  // Some browsers hand over an empty type for files chosen from certain
  // sources; fall back to the extension rather than rejecting a real PDF.
  return file.type === '' && /\.pdf$/i.test(file.name ?? '')
}

/** One imported PDF page, ready to become a booklet page. */
export interface ImportedPdfPage {
  assetId: AssetId
  meta: Omit<AssetMeta, 'id' | 'refCount'>
  placement: Omit<ImageObject, 'id' | 'assetId'>
}

export type PdfImportEvent =
  | { type: 'progress'; completed: number; total: number }
  | { type: 'done'; pages: ImportedPdfPage[] }

export class ImportAbortedError extends Error {
  constructor() {
    super('PDF import was cancelled')
    this.name = 'ImportAbortedError'
  }
}

function checkAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new ImportAbortedError()
}

/**
 * Rasterizes every page of `file` and returns them as placement-ready entries.
 *
 * This deliberately touches only the asset store, never the project store: the
 * caller commits all pages in one mutation once the whole document has
 * succeeded (design.md D4). That ordering is what makes an import all-or-nothing
 * and a single undo step. If anything fails or the caller aborts, assets written
 * during the attempt are swept, since nothing references them.
 */
export interface ImportPdfOptions {
  signal?: AbortSignal
  /**
   * Whether an asset id is already referenced by the project. Assets are
   * content-addressed, so an aborted import can legitimately produce an id that
   * existing pages already point at (re-importing the same PDF, or a page whose
   * pixels match an existing image). Those must survive the sweep.
   */
  isAssetReferenced?: (assetId: AssetId) => boolean
}

export async function* importPdf(
  file: Blob & { name?: string },
  paperSize: PaperSize,
  options: ImportPdfOptions = {},
): AsyncGenerator<PdfImportEvent, void, undefined> {
  const { signal, isAssetReferenced } = options
  const writtenAssetIds: AssetId[] = []
  const pageSizePt = bookletPageSize(paperSize)
  let doc: Awaited<ReturnType<typeof openPdfDocument>> | null = null

  try {
    checkAborted(signal)
    doc = await openPdfDocument(file)

    const total = doc.numPages
    const pages: ImportedPdfPage[] = []

    for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
      checkAborted(signal)

      const page = await doc.getPage(pageNumber)
      const scale = renderScaleForPaper(
        page.getViewport({ scale: 1 }),
        paperSize,
      )
      const { blob } = await renderPdfPageToBlob(page, scale)

      checkAborted(signal)

      // Routing through importImage gives PDF pages the same content-hash
      // dedup, 300 DPI ceiling, and refcounted storage as any other image
      // (design.md D2).
      const { assetId, meta } = await importImage(blob, paperSize)
      writtenAssetIds.push(assetId)

      const fit = fitToPageFraction(
        { width: meta.width, height: meta.height },
        pageSizePt,
      )

      pages.push({
        assetId,
        meta,
        placement: {
          x: 0.5,
          y: 0.5,
          width: fit.width,
          height: fit.height,
          rotationDegrees: 0,
          flipX: false,
          flipY: false,
          opacity: 1,
        },
      })

      yield { type: 'progress', completed: pageNumber, total }
    }

    checkAborted(signal)
    yield { type: 'done', pages }
    writtenAssetIds.length = 0 // committed to the caller; no longer orphans
  } finally {
    await doc?.destroy?.()
    await sweepUnreferencedAssets(writtenAssetIds, isAssetReferenced)
  }
}

/**
 * Removes assets written during an attempt that never reached the store. The
 * project store was never touched, so these hold no references *from this
 * import* -- but because ids are content hashes, one may coincide with an asset
 * existing pages already use, and deleting that would destroy live content.
 * Anything the caller reports as referenced is left alone.
 */
async function sweepUnreferencedAssets(
  assetIds: AssetId[],
  isAssetReferenced: ((assetId: AssetId) => boolean) | undefined,
): Promise<void> {
  if (assetIds.length === 0) return
  const orphans = [...new Set(assetIds)].filter(
    (id) => !isAssetReferenced?.(id),
  )
  await Promise.allSettled(orphans.map((id) => deleteAssetBytes(id)))
}
