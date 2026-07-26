'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useRequireAuth } from '@/lib/useRequireAuth'
import { api } from '@/lib/api'
import { compressImage } from '@/lib/compress-image'
import { SECTION_TYPES, sectionLabel } from '@/lib/sections'
import {
  deletePhoto,
  getAllPhotosForInspection,
  markUploaded,
  savePhoto,
  type PendingPhoto,
} from '@/lib/offline-db'

export default function CapturePage() {
  const token = useRequireAuth()
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const inspectionId = params.id
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [photos, setPhotos] = useState<PendingPhoto[]>([])
  const [section, setSection] = useState(SECTION_TYPES[0][0])
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const [syncing, setSyncing] = useState(false)
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshPhotos = useCallback(async () => {
    const stored = await getAllPhotosForInspection(inspectionId)
    setPhotos(stored.sort((a, b) => a.photoOrder - b.photoOrder))
  }, [inspectionId])

  useEffect(() => {
    refreshPhotos()
  }, [refreshPhotos])

  useEffect(() => {
    const urls: Record<string, string> = {}
    photos.forEach((p) => {
      urls[p.clientPhotoId] = URL.createObjectURL(p.blob)
    })
    setThumbUrls(urls)
    return () => {
      Object.values(urls).forEach((u) => URL.revokeObjectURL(u))
    }
  }, [photos])

  const syncPhotos = useCallback(async () => {
    if (!navigator.onLine) return
    setSyncing(true)
    setError(null)
    try {
      const pending = (await getAllPhotosForInspection(inspectionId)).filter((p) => !p.uploaded)
      for (const p of pending) {
        const formData = new FormData()
        formData.append('file', p.blob, `${p.clientPhotoId}.jpg`)
        formData.append('client_photo_id', p.clientPhotoId)
        formData.append('photo_order', String(p.photoOrder))
        formData.append('section_type', p.sectionType)
        if (p.lat != null) formData.append('lat', String(p.lat))
        if (p.lon != null) formData.append('lon', String(p.lon))
        if (p.takenAt) formData.append('taken_at', p.takenAt)
        await api.uploadPhoto(inspectionId, formData)
        await markUploaded(p.clientPhotoId)
      }
      await refreshPhotos()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de synchronisation')
    } finally {
      setSyncing(false)
    }
  }, [inspectionId, refreshPhotos])

  useEffect(() => {
    function goOnline() {
      setOnline(true)
      syncPhotos()
    }
    function goOffline() {
      setOnline(false)
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [syncPhotos])

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    const startOrder = photos.length
    let index = 0
    for (const file of Array.from(files)) {
      try {
        const blob = await compressImage(file)
        const clientPhotoId = crypto.randomUUID()
        await savePhoto({
          clientPhotoId,
          inspectionId,
          blob,
          photoOrder: startOrder + index,
          sectionType: section,
          lat: null,
          lon: null,
          takenAt: new Date().toISOString(),
          uploaded: false,
        })
        index += 1
      } catch {
        setError("Une photo n'a pas pu être traitée")
      }
    }
    await refreshPhotos()
    if (navigator.onLine) syncPhotos()
  }

  async function handleRemove(clientPhotoId: string) {
    await deletePhoto(clientPhotoId)
    await refreshPhotos()
  }

  async function handleFinish() {
    setError(null)
    const pending = photos.filter((p) => !p.uploaded)
    if (pending.length > 0) {
      if (!online) {
        setError('Des photos ne sont pas encore synchronisées. Reconnectez-vous avant de terminer.')
        return
      }
      await syncPhotos()
    }
    setFinishing(true)
    try {
      await api.queueInspection(inspectionId)
      router.push(`/inspections/${inspectionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la mise en file d'attente")
    } finally {
      setFinishing(false)
    }
  }

  if (!token) return null

  const pendingCount = photos.filter((p) => !p.uploaded).length

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => router.push('/dashboard')} className="text-stone-500 text-sm">
          ← Retour
        </button>
        <span
          className={`text-xs px-2 py-1 rounded-full ${
            online ? 'bg-green-100 text-green-800' : 'bg-stone-200 text-stone-600'
          }`}
        >
          {online ? 'En ligne' : 'Hors ligne'}
        </span>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        <p className="text-sm text-stone-600">
          {photos.length} photo{photos.length !== 1 ? 's' : ''} capturée{photos.length !== 1 ? 's' : ''}
          {pendingCount > 0 && ` — ${pendingCount} en attente de synchronisation`}
        </p>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">Section en cours</label>
          <div className="flex gap-2">
            {SECTION_TYPES.map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => setSection(value)}
                className={`flex-1 rounded border px-3 py-2 text-sm ${
                  section === value
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-stone-300 text-stone-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-1">
            Les photos ajoutées ci-dessous seront associées à cette section.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 text-blue-700 py-8 font-medium"
        >
          📷 Ajouter des photos
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.clientPhotoId} className="relative aspect-square">
              {thumbUrls[p.clientPhotoId] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbUrls[p.clientPhotoId]}
                  alt=""
                  className="w-full h-full object-cover rounded"
                />
              )}
              <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                {sectionLabel(p.sectionType)}
              </span>
              {!p.uploaded && (
                <span className="absolute top-1 left-1 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded">
                  En attente
                </span>
              )}
              <button
                onClick={() => handleRemove(p.clientPhotoId)}
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 text-xs leading-5"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 p-4">
        <div className="max-w-lg mx-auto flex gap-2">
          <button
            onClick={syncPhotos}
            disabled={syncing || !online || pendingCount === 0}
            className="flex-1 rounded border border-stone-300 py-2 font-medium text-stone-700 disabled:opacity-40"
          >
            {syncing ? 'Synchronisation...' : `Synchroniser (${pendingCount})`}
          </button>
          <button
            onClick={handleFinish}
            disabled={finishing || photos.length === 0}
            className="flex-1 rounded bg-blue-600 text-white py-2 font-medium hover:bg-blue-700 disabled:opacity-40"
          >
            {finishing ? 'Envoi...' : "Terminer l'inspection"}
          </button>
        </div>
      </div>
    </div>
  )
}
