import JSZip from 'jszip'
import { getAssetBytes, putAssetBytes } from '../assets/assetStore'
import {
  CURRENT_PROJECT_FORMAT_VERSION,
  type AssetId,
  type Project,
} from '../model/types'

const PROJECT_ENTRY = 'project.json'

function assetFileExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/webp') return 'webp'
  return 'png'
}

function assetEntryPath(assetId: AssetId, mimeType: string): string {
  return `assets/${assetId}.${assetFileExtension(mimeType)}`
}

/**
 * Builds a self-contained `.booklet` file: `project.json` (the normalized
 * store, including `formatVersion`) plus `assets/<hash>.<ext>` for every
 * asset the project references (design.md D9) -- a ZIP rather than a single
 * JSON blob, so image bytes never go through base64 inflation.
 *
 * Internally everything moves as `ArrayBuffer`, never `Blob`: JSZip's Blob
 * support depends on browser-only APIs that behave inconsistently outside a
 * full browser (e.g. in tests), while ArrayBuffer works identically
 * everywhere. The public API still speaks Blob at the edges.
 */
export async function saveBookletFile(project: Project): Promise<Blob> {
  const zip = new JSZip()
  zip.file(PROJECT_ENTRY, JSON.stringify(project))

  const assetIds = Object.keys(project.assets)
  for (const assetId of assetIds) {
    const meta = project.assets[assetId]
    const blob = await getAssetBytes(assetId)
    if (!blob) continue // orphaned reference; export what we can rather than fail the whole save
    zip.file(assetEntryPath(assetId, meta.mimeType), await blob.arrayBuffer())
  }

  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return new Blob([new Uint8Array(bytes)], { type: 'application/zip' })
}

export class InvalidBookletFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidBookletFileError'
  }
}

export class NewerBookletFormatError extends Error {
  constructor(fileVersion: number) {
    super(
      `This file was saved by a newer version of Booklet Creator (format ${fileVersion}, this app supports up to ${CURRENT_PROJECT_FORMAT_VERSION}).`,
    )
    this.name = 'NewerBookletFormatError'
  }
}

/**
 * Parses a `.booklet` file and restores its assets into IndexedDB. Rejects
 * invalid files and files from a newer format version with a clear error,
 * and -- critically -- never touches the current project or its assets
 * before successfully finishing validation, so a bad file can't clobber
 * in-progress work (persistence spec "reject ... without altering the
 * current project").
 */
export async function loadBookletFile(file: Blob): Promise<Project> {
  let zip: JSZip
  try {
    const buffer = await file.arrayBuffer()
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new InvalidBookletFileError('Not a valid .booklet file')
  }

  const projectEntry = zip.file(PROJECT_ENTRY)
  if (!projectEntry) throw new InvalidBookletFileError('Missing project.json')

  let project: Project
  try {
    const text = await projectEntry.async('text')
    project = JSON.parse(text)
  } catch {
    throw new InvalidBookletFileError('project.json could not be parsed')
  }

  if (typeof project.formatVersion !== 'number') {
    throw new InvalidBookletFileError('Missing formatVersion')
  }
  if (project.formatVersion > CURRENT_PROJECT_FORMAT_VERSION) {
    throw new NewerBookletFormatError(project.formatVersion)
  }

  // Only after full validation do we write anything -- restore each asset's
  // bytes so the opened project's images are available immediately.
  const assetIds = Object.keys(project.assets ?? {})
  for (const assetId of assetIds) {
    const meta = project.assets[assetId]
    const entry = zip.file(assetEntryPath(assetId, meta.mimeType))
    if (!entry) continue
    const buffer = await entry.async('arraybuffer')
    await putAssetBytes(assetId, new Blob([buffer], { type: meta.mimeType }))
  }

  return project
}
