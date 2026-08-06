import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Project } from '../model/types'

interface SnapshotDbSchema extends DBSchema {
  snapshot: {
    key: 'current'
    value: Project
  }
}

const DB_NAME = 'booklet-creator-project'
const DB_VERSION = 1
const STORE_NAME = 'snapshot'
const KEY = 'current'

let dbPromise: Promise<IDBPDatabase<SnapshotDbSchema>> | undefined

function getDb(): Promise<IDBPDatabase<SnapshotDbSchema>> {
  dbPromise ??= openDB<SnapshotDbSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME)
    },
  })
  return dbPromise
}

export class CorruptSnapshotError extends Error {
  constructor(cause: unknown) {
    super('Saved project data could not be read')
    this.name = 'CorruptSnapshotError'
    this.cause = cause
  }
}

export class StorageUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Local storage is unavailable')
    this.name = 'StorageUnavailableError'
    this.cause = cause
  }
}

export class StorageQuotaExceededError extends Error {
  constructor(cause: unknown) {
    super('Local storage quota was exceeded')
    this.name = 'StorageQuotaExceededError'
    this.cause = cause
  }
}

function classifyWriteError(err: unknown): Error {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return new StorageQuotaExceededError(err)
  }
  return new StorageUnavailableError(err)
}

/** Overwrites the autosaved project snapshot. Throws a typed error on failure; never partially writes. */
export async function saveProjectSnapshot(project: Project): Promise<void> {
  let db: IDBPDatabase<SnapshotDbSchema>
  try {
    db = await getDb()
  } catch (err) {
    throw new StorageUnavailableError(err)
  }
  try {
    await db.put(STORE_NAME, project, KEY)
  } catch (err) {
    throw classifyWriteError(err)
  }
}

/**
 * Loads the autosaved project snapshot, or `undefined` if none exists yet.
 * Throws `CorruptSnapshotError` if data exists but can't be read as a valid
 * project -- callers must not delete it automatically (persistence spec
 * "unreadable or corrupt saved data"); offer a new project instead and leave
 * the stored bytes for possible manual recovery.
 */
export async function loadProjectSnapshot(): Promise<Project | undefined> {
  let db: IDBPDatabase<SnapshotDbSchema>
  try {
    db = await getDb()
  } catch (err) {
    throw new StorageUnavailableError(err)
  }

  let value: Project | undefined
  try {
    value = await db.get(STORE_NAME, KEY)
  } catch (err) {
    throw new CorruptSnapshotError(err)
  }
  if (value === undefined) return undefined
  if (!isPlausibleProject(value))
    throw new CorruptSnapshotError(new Error('Malformed project shape'))
  return value
}

function isPlausibleProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<Project>
  return (
    typeof v.formatVersion === 'number' &&
    Array.isArray(v.pageOrder) &&
    typeof v.pages === 'object' &&
    typeof v.objects === 'object' &&
    typeof v.assets === 'object' &&
    typeof v.activePageId === 'string'
  )
}

/** Explicitly clears the autosave snapshot (used when starting a deliberately new project). */
export async function clearProjectSnapshot(): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_NAME, KEY)
}
