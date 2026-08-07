/**
 * pdf.js is only needed when a user actually imports a PDF, and it is large
 * enough to matter for first paint -- so it is pulled in through a dynamic
 * `import()` and lands in its own chunk (design.md D1). The worker is resolved
 * from the bundled module rather than a CDN, which keeps the zero-network
 * guarantee: nothing about an imported PDF, including the code that reads it,
 * touches a remote host.
 */

type PdfjsModule = typeof import('pdfjs-dist')

let modulePromise: Promise<PdfjsModule> | null = null

export function loadPdfjs(): Promise<PdfjsModule> {
  modulePromise ??= (async () => {
    const [pdfjs, workerSrc] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.mjs?url').then((m) => m.default),
    ])
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
    return pdfjs
  })()
  return modulePromise
}

/** Test seam: drops the memoized module so a fresh load can be observed. */
export function resetPdfjsForTests(): void {
  modulePromise = null
}
