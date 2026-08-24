import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export interface PendingPhoto {
  clientPhotoId: string
  inspectionId: string
  blob: Blob
  photoOrder: number
  sectionType: string
  locationDetail?: string
  lat: number | null
  lon: number | null
  takenAt: string
  uploaded: boolean
  serverId?: string
}

interface InspectDB extends DBSchema {
  photos: {
    key: string
    value: PendingPhoto
    indexes: { 'by-inspection': string }
  }
}

let dbPromise: Promise<IDBPDatabase<InspectDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<InspectDB>('inspect-ia', 1, {
      upgrade(db) {
        const store = db.createObjectStore('photos', { keyPath: 'clientPhotoId' })
        store.createIndex('by-inspection', 'inspectionId')
      },
    })
  }
  return dbPromise
}

export async function savePhoto(photo: PendingPhoto) {
  const db = await getDb()
  await db.put('photos', photo)
}

export async function getAllPhotosForInspection(inspectionId: string) {
  const db = await getDb()
  return db.getAllFromIndex('photos', 'by-inspection', inspectionId)
}

export async function markUploaded(clientPhotoId: string, serverId: string) {
  const db = await getDb()
  const photo = await db.get('photos', clientPhotoId)
  if (photo) {
    photo.uploaded = true
    photo.serverId = serverId
    await db.put('photos', photo)
  }
}

export async function deletePhoto(clientPhotoId: string) {
  const db = await getDb()
  await db.delete('photos', clientPhotoId)
}
