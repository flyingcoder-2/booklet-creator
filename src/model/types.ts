import type { FlipMode, Margins, PaperSize } from '../imposition/geometry'

export type PageId = string
export type ObjectId = string
/** Content-addressed by the SHA-256 hex digest of the (post-downscale) image bytes. */
export type AssetId = string

export interface CropRect {
  /** Fractions (0-1) of the source asset's own pixel dimensions. */
  x: number
  y: number
  width: number
  height: number
}

/**
 * An image placed on a page. Position and size are normalized to fractions of
 * the page's width/height (design.md D3) so layout survives paper-size changes
 * and works identically across canvas, thumbnail, preview, and PDF output.
 */
export interface ImageObject {
  id: ObjectId
  assetId: AssetId
  /** Center x, as a fraction of page width. */
  x: number
  /** Center y, as a fraction of page height. */
  y: number
  /** Width as a fraction of page width. */
  width: number
  /** Height as a fraction of page height. */
  height: number
  /** Clockwise rotation in degrees about the object's center. */
  rotationDegrees: number
  flipX: boolean
  flipY: boolean
  /** 0-1. */
  opacity: number
  /** Undefined means uncropped (the full source image). */
  crop?: CropRect
}

export interface Page {
  id: PageId
  /** Bottom-to-top layer order. */
  objectOrder: ObjectId[]
}

/** Metadata only — bytes live in IndexedDB, keyed by the same id (design.md D4). */
export interface AssetMeta {
  id: AssetId
  refCount: number
  width: number
  height: number
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  byteLength: number
}

export interface ProjectSettings {
  paperSize: PaperSize
  margins: Margins
  bleed: number
  cropMarks: boolean
  flipMode: FlipMode
}

export const CURRENT_PROJECT_FORMAT_VERSION = 1

export interface Project {
  formatVersion: number
  settings: ProjectSettings
  /** Real (non-padded) pages, in display order. */
  pageOrder: PageId[]
  pages: Record<PageId, Page>
  objects: Record<ObjectId, ImageObject>
  assets: Record<AssetId, AssetMeta>
  activePageId: PageId
}
