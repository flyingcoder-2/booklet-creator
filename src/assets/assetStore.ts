import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { AssetId } from '../model/types'

interface AssetDbSchema extends DBSchema {
  assets: {
    key: AssetId
    value: Blob
  }
}

const DB_NAME = 'booklet-creator-assets'
const DB_VERSION = 1
const STORE_NAME = 'assets'

let dbPromise: Promise<IDBPDatabase<AssetDbSchema>> | undefined

function getDb(): Promise<IDBPDatabase<AssetDbSchema>> {
  dbPromise ??= openDB<AssetDbSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME)
    },
  })
  return dbPromise
}

/** Stores the (already downscaled) bytes for a content-addressed asset. */
export async function putAssetBytes(id: AssetId, blob: Blob): Promise<void> {
  const db = await getDb()
  await db.put(STORE_NAME, blob, id)
}

export async function getAssetBytes(id: AssetId): Promise<Blob | undefined> {
  const db = await getDb()
  return db.get(STORE_NAME, id)
}

/** Called only when an asset's reference count reaches zero. */
export async function deleteAssetBytes(id: AssetId): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_NAME, id)
}

export async function hasAssetBytes(id: AssetId): Promise<boolean> {
  const db = await getDb()
  return (await db.count(STORE_NAME, id)) > 0
}
