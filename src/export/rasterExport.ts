import JSZip from 'jszip'
import { loadImageElement } from '../editor/imageCache'
import { bookletPageSize, type PaperSize } from '../imposition/geometry'
import type { Page, Project } from '../model/types'
import type { PixelSize } from '../render/placement'
import { renderPage, type RenderableObject } from '../render/renderPage'

const POINTS_PER_INCH = 72

export type RasterFormat = 'png' | 'jpeg'

export interface RasterExportOptions {
  format: RasterFormat
  /** Output resolution in pixels per inch. */
  dpi: number
  /** 0-1, only used for `format: 'jpeg'`. */
  jpegQuality?: number
}

function pageSizePxAtDpi(paperSize: PaperSize, dpi: number): PixelSize {
  const pageSizePt = bookletPageSize(paperSize)
  return {
    width: (pageSizePt.width / POINTS_PER_INCH) * dpi,
    height: (pageSizePt.height / POINTS_PER_INCH) * dpi,
  }
}

async function resolveRenderableObjects(
  page: Page,
  project: Pick<Project, 'objects' | 'assets'>,
): Promise<RenderableObject[]> {
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

/**
 * Renders one booklet page (not an imposed sheet) to a PNG/JPEG blob at the
 * given DPI, via the shared renderer -- so overlays (margins, guides, grid,
 * selection handles) are structurally excluded, the same as the editor
 * canvas, thumbnails, and preview never drawing them (export spec "Raster
 * page export").
 */
export async function exportPageAsBlob(
  page: Page,
  project: Pick<Project, 'objects' | 'assets' | 'settings'>,
  options: RasterExportOptions,
): Promise<Blob> {
  const size = pageSizePxAtDpi(project.settings.paperSize, options.dpi)
  const canvas = new OffscreenCanvas(
    Math.round(size.width),
    Math.round(size.height),
  )
  const ctx = canvas.getContext('2d')
  if (!ctx)
    throw new Error('exportPageAsBlob: could not acquire a 2D canvas context')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const renderable = await resolveRenderableObjects(page, project)
  renderPage(ctx, renderable, { width: canvas.width, height: canvas.height })

  if (options.format === 'jpeg') {
    return canvas.convertToBlob({
      type: 'image/jpeg',
      quality: options.jpegQuality ?? 0.92,
    })
  }
  return canvas.convertToBlob({ type: 'image/png' })
}

export function pageFileName(
  pageNumber: number,
  totalPages: number,
  format: RasterFormat,
): string {
  const digits = String(totalPages).length
  const padded = String(pageNumber).padStart(digits, '0')
  return `page-${padded}.${format === 'jpeg' ? 'jpg' : 'png'}`
}

/**
 * Bundles every real booklet page (in page-number order) as individually
 * named image files in a ZIP archive (export spec "Raster page export").
 */
export async function exportPagesAsZip(
  project: Pick<
    Project,
    'pageOrder' | 'pages' | 'objects' | 'assets' | 'settings'
  >,
  options: RasterExportOptions,
): Promise<Blob> {
  const zip = new JSZip()
  const totalPages = project.pageOrder.length

  for (let i = 0; i < totalPages; i++) {
    const pageId = project.pageOrder[i]
    const page = project.pages[pageId]
    if (!page) continue
    const blob = await exportPageAsBlob(page, project, options)
    zip.file(pageFileName(i + 1, totalPages, options.format), blob)
  }

  return zip.generateAsync({ type: 'blob' })
}
