import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '../model/types'
import { CURRENT_PROJECT_FORMAT_VERSION } from '../model/types'

const assetBytes = new Map<string, Blob>()

vi.mock('../assets/assetStore', () => ({
  getAssetBytes: vi.fn(async (id: string) => assetBytes.get(id)),
  putAssetBytes: vi.fn(async (id: string, blob: Blob) => {
    assetBytes.set(id, blob)
  }),
}))

const {
  saveBookletFile,
  loadBookletFile,
  InvalidBookletFileError,
  NewerBookletFormatError,
} = await import('./bookletFile')

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
    settings: {
      paperSize: 'letter',
      margins: { top: 24, right: 24, bottom: 24, left: 24 },
      bleed: 0,
      cropMarks: false,
      flipMode: 'vertical-axis',
    },
    pageOrder: ['page-1'],
    pages: { 'page-1': { id: 'page-1', objectOrder: ['obj-1'] } },
    objects: {
      'obj-1': {
        id: 'obj-1',
        assetId: 'asset-1',
        x: 0.5,
        y: 0.5,
        width: 0.5,
        height: 0.5,
        rotationDegrees: 0,
        flipX: false,
        flipY: false,
        opacity: 1,
      },
    },
    assets: {
      'asset-1': {
        id: 'asset-1',
        refCount: 1,
        width: 10,
        height: 10,
        mimeType: 'image/png',
        byteLength: 4,
      },
    },
    activePageId: 'page-1',
    ...overrides,
  }
}

beforeEach(() => {
  assetBytes.clear()
})

describe('saveBookletFile / loadBookletFile', () => {
  it('round-trips a project, including its asset bytes', async () => {
    assetBytes.set(
      'asset-1',
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }),
    )
    const project = makeProject()

    const fileBlob = await saveBookletFile(project)
    assetBytes.clear() // simulate opening on a machine with empty asset storage

    const loaded = await loadBookletFile(fileBlob)

    expect(loaded.pageOrder).toEqual(project.pageOrder)
    expect(loaded.objects).toEqual(project.objects)
    expect(loaded.assets).toEqual(project.assets)
    expect(assetBytes.has('asset-1')).toBe(true)
    const restoredBytes = new Uint8Array(
      await assetBytes.get('asset-1')!.arrayBuffer(),
    )
    expect(Array.from(restoredBytes)).toEqual([1, 2, 3, 4])
  })

  it('rejects a file with a newer format version, without touching asset storage', async () => {
    const project = makeProject({
      formatVersion: CURRENT_PROJECT_FORMAT_VERSION + 1,
    })
    const zip = await import('jszip')
    const archive = new zip.default()
    archive.file('project.json', JSON.stringify(project))
    const fileBlob = await archive.generateAsync({ type: 'blob' })

    await expect(loadBookletFile(fileBlob)).rejects.toBeInstanceOf(
      NewerBookletFormatError,
    )
    expect(assetBytes.size).toBe(0)
  })

  it('rejects a non-zip file', async () => {
    const fileBlob = new Blob(['not a zip'], { type: 'text/plain' })
    await expect(loadBookletFile(fileBlob)).rejects.toBeInstanceOf(
      InvalidBookletFileError,
    )
  })

  it('rejects a zip missing project.json', async () => {
    const zip = await import('jszip')
    const archive = new zip.default()
    archive.file('readme.txt', 'not a project')
    const fileBlob = await archive.generateAsync({ type: 'blob' })

    await expect(loadBookletFile(fileBlob)).rejects.toBeInstanceOf(
      InvalidBookletFileError,
    )
  })
})
