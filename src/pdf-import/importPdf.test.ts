import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EncryptedPdfError,
  InvalidPdfError,
  type PdfDocumentLike,
} from './pdfDocument'
import {
  ImportAbortedError,
  importPdf,
  isPdfFile,
  type PdfImportEvent,
} from './importPdf'

/**
 * The rasterization step needs `OffscreenCanvas` and a real pdf.js worker, so
 * these tests drive `importPdf`'s orchestration with the collaborators stubbed:
 * page count, progress reporting, placement, cancellation, and the orphan-asset
 * sweep. Rendering fidelity against a real PDF is verified live in the browser.
 */

const openPdfDocument = vi.hoisted(() => vi.fn())
const renderPdfPageToBlob = vi.hoisted(() => vi.fn())
const importImage = vi.hoisted(() => vi.fn())
const deleteAssetBytes = vi.hoisted(() => vi.fn())

vi.mock('./pdfDocument', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pdfDocument')>()),
  openPdfDocument,
}))
vi.mock('./renderPdfPage', () => ({ renderPdfPageToBlob }))
vi.mock('../assets/importImage', () => ({ importImage }))
vi.mock('../assets/assetStore', () => ({ deleteAssetBytes }))

function fakeDocument(numPages: number): PdfDocumentLike {
  return {
    numPages,
    getPage: vi.fn(async () => ({
      getViewport: () => ({ width: 396, height: 612 }),
      render: () => ({ promise: Promise.resolve() }),
    })),
    destroy: vi.fn(),
  }
}

/** Distinct asset per page, so sweep assertions can tell them apart. */
function distinctAssetPerPage() {
  let n = 0
  importImage.mockImplementation(async () => {
    n += 1
    return {
      assetId: `asset-${n}`,
      meta: {
        width: 1650,
        height: 2550,
        mimeType: 'image/png',
        byteLength: 1000,
      },
    }
  })
}

async function collect(
  gen: AsyncGenerator<PdfImportEvent, void, undefined>,
): Promise<PdfImportEvent[]> {
  const events: PdfImportEvent[] = []
  for await (const event of gen) events.push(event)
  return events
}

const pdfFile = () =>
  new Blob([new Uint8Array([1])], { type: 'application/pdf' })

beforeEach(() => {
  vi.clearAllMocks()
  renderPdfPageToBlob.mockResolvedValue({
    blob: new Blob([new Uint8Array([2])], { type: 'image/png' }),
    width: 1650,
    height: 2550,
  })
  distinctAssetPerPage()
})

describe('isPdfFile', () => {
  it('accepts the PDF content type', () => {
    expect(isPdfFile({ type: 'application/pdf' })).toBe(true)
  })

  it('falls back to the extension when the browser reports no type', () => {
    expect(isPdfFile({ type: '', name: 'zine.pdf' })).toBe(true)
    expect(isPdfFile({ type: '', name: 'photo.png' })).toBe(false)
  })

  it('rejects image types', () => {
    expect(isPdfFile({ type: 'image/png', name: 'a.png' })).toBe(false)
  })
})

describe('importPdf', () => {
  it('yields one progress event per page, then done with a page each', async () => {
    openPdfDocument.mockResolvedValue(fakeDocument(3))

    const events = await collect(importPdf(pdfFile(), 'letter'))

    expect(events).toEqual([
      { type: 'progress', completed: 1, total: 3 },
      { type: 'progress', completed: 2, total: 3 },
      { type: 'progress', completed: 3, total: 3 },
      { type: 'done', pages: expect.any(Array) },
    ])
    const done = events.at(-1) as Extract<PdfImportEvent, { type: 'done' }>
    expect(done.pages).toHaveLength(3)
    expect(done.pages.map((p) => p.assetId)).toEqual([
      'asset-1',
      'asset-2',
      'asset-3',
    ])
  })

  it('places every imported page centered and fully visible', async () => {
    openPdfDocument.mockResolvedValue(fakeDocument(1))

    const events = await collect(importPdf(pdfFile(), 'letter'))
    const done = events.at(-1) as Extract<PdfImportEvent, { type: 'done' }>
    const { placement } = done.pages[0]

    expect(placement.x).toBe(0.5)
    expect(placement.y).toBe(0.5)
    expect(placement.width).toBeLessThanOrEqual(1)
    expect(placement.height).toBeLessThanOrEqual(1)
    expect(placement.rotationDegrees).toBe(0)
    expect(placement.opacity).toBe(1)
  })

  it('handles a single-page document', async () => {
    openPdfDocument.mockResolvedValue(fakeDocument(1))
    const events = await collect(importPdf(pdfFile(), 'letter'))
    const done = events.at(-1) as Extract<PdfImportEvent, { type: 'done' }>
    expect(done.pages).toHaveLength(1)
  })

  it('does not delete assets after a successful import', async () => {
    openPdfDocument.mockResolvedValue(fakeDocument(2))
    await collect(importPdf(pdfFile(), 'letter'))
    expect(deleteAssetBytes).not.toHaveBeenCalled()
  })

  it('aborts mid-import and sweeps the assets it had already written', async () => {
    openPdfDocument.mockResolvedValue(fakeDocument(5))
    const controller = new AbortController()

    const events: PdfImportEvent[] = []
    await expect(async () => {
      for await (const event of importPdf(pdfFile(), 'letter', {
        signal: controller.signal,
      })) {
        events.push(event)
        if (event.type === 'progress' && event.completed === 2) {
          controller.abort()
        }
      }
    }).rejects.toBeInstanceOf(ImportAbortedError)

    // Only the pages rendered before the abort were processed...
    expect(events).toHaveLength(2)
    // ...and their assets are cleaned up rather than left orphaned.
    expect(deleteAssetBytes.mock.calls.flat()).toEqual(['asset-1', 'asset-2'])
  })

  it('never sweeps an asset the project still references', async () => {
    // Content-addressed ids mean an aborted import can produce an id existing
    // pages already point at -- deleting it would destroy live content.
    openPdfDocument.mockResolvedValue(fakeDocument(5))
    const controller = new AbortController()

    await expect(async () => {
      for await (const event of importPdf(pdfFile(), 'letter', {
        signal: controller.signal,
        isAssetReferenced: (id) => id === 'asset-1',
      })) {
        if (event.type === 'progress' && event.completed === 2) {
          controller.abort()
        }
      }
    }).rejects.toBeInstanceOf(ImportAbortedError)

    const deleted = deleteAssetBytes.mock.calls.flat()
    expect(deleted).toContain('asset-2')
    expect(deleted).not.toContain('asset-1')
  })

  it('aborts before doing any work when the signal is already aborted', async () => {
    openPdfDocument.mockResolvedValue(fakeDocument(3))

    await expect(
      collect(importPdf(pdfFile(), 'letter', { signal: AbortSignal.abort() })),
    ).rejects.toBeInstanceOf(ImportAbortedError)

    expect(importImage).not.toHaveBeenCalled()
  })

  it('propagates a password-protected document as EncryptedPdfError', async () => {
    openPdfDocument.mockRejectedValue(new EncryptedPdfError())

    await expect(
      collect(importPdf(pdfFile(), 'letter')),
    ).rejects.toBeInstanceOf(EncryptedPdfError)
    expect(importImage).not.toHaveBeenCalled()
  })

  it('propagates an unparseable document as InvalidPdfError', async () => {
    openPdfDocument.mockRejectedValue(new InvalidPdfError())

    await expect(
      collect(importPdf(pdfFile(), 'letter')),
    ).rejects.toBeInstanceOf(InvalidPdfError)
  })

  it('sweeps written assets when storage fails partway through', async () => {
    openPdfDocument.mockResolvedValue(fakeDocument(4))
    importImage
      .mockImplementationOnce(async () => ({
        assetId: 'asset-1',
        meta: {
          width: 1650,
          height: 2550,
          mimeType: 'image/png',
          byteLength: 1000,
        },
      }))
      .mockImplementationOnce(async () => {
        throw new Error('QuotaExceededError')
      })

    await expect(collect(importPdf(pdfFile(), 'letter'))).rejects.toThrow(
      'QuotaExceededError',
    )
    expect(deleteAssetBytes.mock.calls.flat()).toEqual(['asset-1'])
  })
})
