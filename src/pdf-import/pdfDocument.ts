import { loadPdfjs } from './loadPdfjs'

/** The PDF is readable but locked behind a password we deliberately don't prompt for. */
export class EncryptedPdfError extends Error {
  constructor() {
    super('This PDF is password-protected and cannot be imported.')
    this.name = 'EncryptedPdfError'
  }
}

/** The file isn't a PDF we can parse at all. */
export class InvalidPdfError extends Error {
  constructor() {
    super('This file could not be read as a PDF.')
    this.name = 'InvalidPdfError'
  }
}

/** Structural subset of a pdf.js page that the import pipeline actually uses. */
export interface PdfPageLike {
  getViewport(params: { scale: number }): { width: number; height: number }
  render(params: {
    canvasContext: unknown
    viewport: { width: number; height: number }
  }): { promise: Promise<void>; cancel?: () => void }
  cleanup?: () => void
}

/** Structural subset of a pdf.js document. */
export interface PdfDocumentLike {
  numPages: number
  getPage(pageNumber: number): Promise<PdfPageLike>
  destroy?: () => Promise<void> | void
}

/**
 * Opens a PDF with pdf.js, translating its failure modes into the two the UI
 * distinguishes. pdf.js signals a password requirement with a `PasswordException`
 * (name-tagged rather than exported for `instanceof`), and everything else that
 * prevents parsing -- truncated files, non-PDF bytes, corrupt xref -- collapses
 * into `InvalidPdfError`.
 */
export async function openPdfDocument(file: Blob): Promise<PdfDocumentLike> {
  const pdfjs = await loadPdfjs()
  const data = new Uint8Array(await file.arrayBuffer())

  try {
    const task = pdfjs.getDocument({ data })
    return (await task.promise) as unknown as PdfDocumentLike
  } catch (err) {
    if (isPasswordException(err)) throw new EncryptedPdfError()
    throw new InvalidPdfError()
  }
}

function isPasswordException(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const name = (err as { name?: unknown }).name
  return name === 'PasswordException'
}
