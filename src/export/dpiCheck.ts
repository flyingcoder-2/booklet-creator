import { cropToSourcePixelRect, FULL_CROP } from '../render/placement'
import type {
  AssetMeta,
  ImageObject,
  ObjectId,
  PageId,
  Project,
} from '../model/types'

const POINTS_PER_INCH = 72
export const MIN_RECOMMENDED_DPI = 300

/** Effective print resolution: source pixels (after crop) per printed inch, per axis. */
export function computeEffectiveDpi(
  object: ImageObject,
  assetMeta: AssetMeta,
  printedWidthPt: number,
  printedHeightPt: number,
): { dpiX: number; dpiY: number } {
  const cropPx = cropToSourcePixelRect(object.crop ?? FULL_CROP, {
    width: assetMeta.width,
    height: assetMeta.height,
  })
  const printedWidthIn = printedWidthPt / POINTS_PER_INCH
  const printedHeightIn = printedHeightPt / POINTS_PER_INCH
  return {
    dpiX: printedWidthIn === 0 ? Infinity : cropPx.width / printedWidthIn,
    dpiY: printedHeightIn === 0 ? Infinity : cropPx.height / printedHeightIn,
  }
}

export interface LowDpiPlacement {
  pageId: PageId
  pageNumber: number
  objectId: ObjectId
  dpi: number
}

/**
 * Scans every real placement in the project and returns those printing below
 * `MIN_RECOMMENDED_DPI` at their current size, naming the booklet page (export
 * spec "Image quality and resolution"). Advisory only -- callers decide
 * whether to warn and whether to continue.
 */
export function findLowDpiPlacements(
  project: Pick<Project, 'pageOrder' | 'pages' | 'objects' | 'assets'>,
  pageSizePt: { width: number; height: number },
): LowDpiPlacement[] {
  const results: LowDpiPlacement[] = []

  project.pageOrder.forEach((pageId, index) => {
    const page = project.pages[pageId]
    if (!page) return
    for (const objectId of page.objectOrder) {
      const object = project.objects[objectId]
      const assetMeta = object && project.assets[object.assetId]
      if (!object || !assetMeta) continue

      const printedWidthPt = object.width * pageSizePt.width
      const printedHeightPt = object.height * pageSizePt.height
      const { dpiX, dpiY } = computeEffectiveDpi(
        object,
        assetMeta,
        printedWidthPt,
        printedHeightPt,
      )
      const dpi = Math.min(dpiX, dpiY)

      if (dpi < MIN_RECOMMENDED_DPI) {
        results.push({ pageId, pageNumber: index + 1, objectId, dpi })
      }
    }
  })

  return results
}
