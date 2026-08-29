'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useRequireAuth } from '@/lib/useRequireAuth'
import { api } from '@/lib/api'
import { compressImage } from '@/lib/compress-image'
import { readPhotoExif } from '@/lib/photo-exif'
import { SECTION_TYPES, sectionLabel } from '@/lib/sections'
import {
  deletePhoto,
  getAllPhotosForInspection,
  markUploaded,
  savePhoto,
  type PendingPhoto,
} from '@/lib/offline-db'
import { DEBUG_MODE, describeError } from '@/lib/debug'

export default function CapturePage() {
  const token = useRequireAuth()
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const inspectionId = params.id
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [photos, setPhotos] = useState<PendingPhoto[]>([])
  const [section, setSection] = useState(SECTION_TYPES[0][0])
  const [location, setLocation] = useState('')
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const [syncing, setSyncing] = useState(false)
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoLimit, setPhotoLimit] = useState<number | null>(null)
  const [storageInfo, setStorageInfo] = useState<string | null>(null)
  // Force le remontage complet du <input type=file> à chaque capture — sur
  // certaines versions de Chrome Android, remettre .value = '' ne suffit pas
  // toujours à réinitialiser l'état interne du sélecteur caméra, qui reste
  // parfois "coincé" après un intent précédent et n'en relance aucun nouveau,
  // sans la moindre erreur JS puisque l'événement change ne se déclenche
  // simplement jamais.
  const [inputKey, setInputKey] = useState(0)
  const [debugLog, setDebugLog] = useState<string[]>([])

  const logDebug = useCallback((msg: string) => {
    if (!DEBUG_MODE) return
    const line = `${new Date().toISOString().slice(11, 23)} — ${msg}`
    setDebugLog((prev) => [...prev.slice(-9), line])
  }, [])

  const refreshPhotos = useCallback(async () => {
    const stored = await getAllPhotosForInspection(inspectionId)
    setPhotos(stored.sort((a, b) => a.photoOrder - b.photoOrder))
  }, [inspectionId])

  useEffect(() => {
    refreshPhotos()
  }, [refreshPhotos])

  // document.wasDiscarded (Chrome) est vrai quand le navigateur a tué puis
  // rechargé silencieusement l'onglet pour libérer de la mémoire pendant que
  // l'appareil photo natif était ouvert au premier plan — la capture en cours
  // à ce moment-là se perd sans qu'aucune erreur JS ne soit possible (la page
  // qui attendait le résultat n'existe plus). Les photos déjà enregistrées
  // restent intactes (IndexedDB), seule la capture en vol au moment du kill
  // disparaît — d'où l'avertissement plutôt qu'un blocage.
  useEffect(() => {
    if (typeof document !== 'undefined' && (document as Document & { wasDiscarded?: boolean }).wasDiscarded) {
      setError(
        "⚠️ Le navigateur a redémarré cette page automatiquement (mémoire faible de l'appareil). " +
          'Vos photos déjà enregistrées sont intactes, mais la dernière capture en cours a pu être perdue — ' +
          'vérifiez le nombre de photos ci-dessous et reprenez si besoin.'
      )
    }
  }, [])

  // Quota IndexedDB dépassé = échec silencieux de savePhoto() sans exception
  // franche selon le navigateur — visible seulement en debug, pour éviter
  // d'ajouter du bruit à l'écran des inspecteurs en prod.
  useEffect(() => {
    if (!DEBUG_MODE) return
    navigator.storage
      ?.estimate()
      .then((estimate) => {
        const usedMb = ((estimate.usage ?? 0) / 1024 / 1024).toFixed(1)
        const quotaMb = ((estimate.quota ?? 0) / 1024 / 1024).toFixed(1)
        setStorageInfo(`${usedMb} Mo / ${quotaMb} Mo utilisés — IndexedDB: ${'indexedDB' in window}`)
      })
      .catch((err) => setStorageInfo(describeError(err, 'estimation du stockage indisponible')))
  }, [photos])

  useEffect(() => {
    if (!token) return
    api
      .getProfile()
      .then((p) => setPhotoLimit(p.effective_max_photos_per_inspection ?? null))
      .catch(() => {})
  }, [token])

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

  // Retourne true si toutes les photos en attente ont bien été synchronisées —
  // handleFinish s'en sert pour ne jamais mettre en file d'attente une
  // inspection à qui il manque des photos (ex. limite de photos atteinte).
  const syncPhotos = useCallback(async (): Promise<boolean> => {
    if (!navigator.onLine) return false
    setSyncing(true)
    setError(null)
    let firstError: string | null = null
    try {
      // Trié par ordre de capture : en cas de limite atteinte, ce sont toujours
      // les photos les plus récentes qui échouent, jamais un sous-ensemble
      // arbitraire — cohérent avec ce que "Supprimer les photos en trop" retire.
      const pending = (await getAllPhotosForInspection(inspectionId))
        .filter((p) => !p.uploaded)
        .sort((a, b) => a.photoOrder - b.photoOrder)
      for (const p of pending) {
        const formData = new FormData()
        formData.append('file', p.blob, `${p.clientPhotoId}.jpg`)
        formData.append('client_photo_id', p.clientPhotoId)
        formData.append('photo_order', String(p.photoOrder))
        formData.append('section_type', p.sectionType)
        if (p.locationDetail) formData.append('location_detail', p.locationDetail)
        if (p.lat != null) formData.append('lat', String(p.lat))
        if (p.lon != null) formData.append('lon', String(p.lon))
        if (p.takenAt) formData.append('taken_at', p.takenAt)
        try {
          const result = await api.uploadPhoto(inspectionId, formData)
          await markUploaded(p.clientPhotoId, result.id)
        } catch (err) {
          // Isolée par photo : un échec (ex. limite atteinte) ne doit pas
          // empêcher les autres photos en attente d'être tentées.
          firstError = firstError ?? describeError(err, 'Erreur de synchronisation')
        }
      }
      await refreshPhotos()
      if (firstError) setError(firstError)
      return firstError === null
    } catch (err) {
      setError(describeError(err, 'Erreur de synchronisation'))
      return false
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
    try {
      const remaining = photoLimit != null ? Math.max(0, photoLimit - photos.length) : Infinity
      const incoming = Array.from(files)
      const accepted = incoming.slice(0, remaining)
      const startOrder = photos.length
      let index = 0
      for (const file of accepted) {
        try {
          // L'EXIF doit être lu sur le fichier original — compressImage()
          // réencode via canvas et ne préserve aucune métadonnée.
          const [blob, exif] = await Promise.all([compressImage(file), readPhotoExif(file)])
          const clientPhotoId = crypto.randomUUID()
          await savePhoto({
            clientPhotoId,
            inspectionId,
            blob,
            photoOrder: startOrder + index,
            sectionType: section,
            locationDetail: location || undefined,
            lat: exif.lat,
            lon: exif.lon,
            takenAt: exif.takenAt ?? new Date().toISOString(),
            uploaded: false,
          })
          index += 1
        } catch (err) {
          setError(describeError(err, "Une photo n'a pas pu être traitée"))
        }
      }
      await refreshPhotos()
      const rejectedCount = incoming.length - accepted.length
      if (rejectedCount > 0) {
        setError(
          `Limite de ${photoLimit} photos atteinte pour cette inspection — ${rejectedCount} photo${
            rejectedCount > 1 ? 's' : ''
          } non ajoutée${rejectedCount > 1 ? 's' : ''}.`
        )
      } else if (navigator.onLine) {
        syncPhotos()
      }
    } catch (err) {
      // Filet de sécurité : sans ça, une erreur hors de la boucle par-photo
      // (ex. refreshPhotos() qui échoue, IndexedDB indisponible) ne remonte
      // qu'en rejet de promesse non catché — invisible, aucune photo n'apparaît
      // et rien ne l'explique à l'écran.
      setError(describeError(err, "Erreur lors de l'ajout des photos"))
    }
  }

  async function handleRemove(clientPhotoId: string) {
    const photo = photos.find((p) => p.clientPhotoId === clientPhotoId)
    if (photo?.uploaded && photo.serverId) {
      // Déjà synchronisée : la retirer côté serveur d'abord (fichier +
      // ligne en base) — sinon elle reste comptée et analysée par l'IA
      // même après avoir disparu de cet écran.
      try {
        await api.deletePhoto(inspectionId, photo.serverId)
      } catch (err) {
        setError(describeError(err, 'Erreur lors de la suppression de la photo'))
        return
      }
    }
    await deletePhoto(clientPhotoId)
    await refreshPhotos()
  }

  // Combien de photos en attente dépassent la capacité restante côté serveur.
  const uploadedCount = photos.filter((p) => p.uploaded).length
  const pendingCount = photos.filter((p) => !p.uploaded).length
  const remainingCapacity = photoLimit != null ? Math.max(0, photoLimit - uploadedCount) : Infinity
  const excessCount = photoLimit != null ? Math.max(0, pendingCount - remainingCapacity) : 0

  async function handleRemoveExcess() {
    const pendingByNewest = photos.filter((p) => !p.uploaded).sort((a, b) => b.photoOrder - a.photoOrder)
    for (const p of pendingByNewest.slice(0, excessCount)) {
      await deletePhoto(p.clientPhotoId)
    }
    await refreshPhotos()
    setError(null)
  }

  async function handleFinish() {
    setError(null)
    const pending = photos.filter((p) => !p.uploaded)
    if (pending.length > 0) {
      if (!online) {
        setError('Des photos ne sont pas encore synchronisées. Reconnectez-vous avant de terminer.')
        return
      }
      const synced = await syncPhotos()
      if (!synced) return
    }
    setFinishing(true)
    try {
      await api.queueInspection(inspectionId)
      router.push(`/inspections/${inspectionId}`)
    } catch (err) {
      setError(describeError(err, "Erreur lors de la mise en file d'attente"))
    } finally {
      setFinishing(false)
    }
  }

  if (!token) return null

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
        {DEBUG_MODE && (
          <div className="rounded-lg border border-purple-300 bg-purple-50 p-3 text-xs text-purple-900 font-mono space-y-1">
            <p>🐛 DEBUG — inspectionId: {inspectionId}</p>
            <p>{storageInfo ?? 'estimation du stockage…'}</p>
            <p>photos locales: {photos.length} (uploadées: {photos.filter((p) => p.uploaded).length})</p>
            <div className="border-t border-purple-200 pt-1 mt-1">
              <p className="font-semibold">Derniers événements (clic / change) :</p>
              {debugLog.length === 0 && <p className="opacity-60">aucun pour l&apos;instant</p>}
              {debugLog.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        )}
        {!online && (
          <div className="rounded-lg border border-stone-300 bg-stone-100 p-3 text-sm text-stone-700">
            📴 Hors ligne — vous pouvez continuer à ajouter des photos normalement,
            mais évitez de rafraîchir la page ou d&apos;utiliser le bouton
            « précédent » du navigateur : cette page précise ne peut se recharger
            que si elle a déjà été visitée en ligne.
          </div>
        )}

        <p className="text-sm text-stone-600">
          {photos.length} photo{photos.length !== 1 ? 's' : ''}
          {photoLimit != null && ` / ${photoLimit}`} capturée{photos.length !== 1 ? 's' : ''}
          {pendingCount > 0 && ` — ${pendingCount} en attente de synchronisation`}
        </p>

        {excessCount > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 space-y-2">
            <p>
              {excessCount} photo{excessCount > 1 ? 's' : ''} dépasse{excessCount > 1 ? 'nt' : ''} la limite de{' '}
              {photoLimit} pour cette inspection et ne pourra{excessCount > 1 ? 'nt' : ''} pas être synchronisée
              {excessCount > 1 ? 's' : ''}.
            </p>
            <button
              onClick={handleRemoveExcess}
              className="rounded border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              Supprimer les {excessCount} photo{excessCount > 1 ? 's' : ''} en trop
            </button>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">Section en cours</label>
          <div className="grid grid-cols-3 gap-2">
            {SECTION_TYPES.map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => setSection(value)}
                className={`rounded border px-2 py-2 text-xs ${
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

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Localisation actuelle (optionnel)
          </label>
          <input
            list="location-suggestions"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="ex. Salle de bain principale"
            className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
          />
          <datalist id="location-suggestions">
            {Array.from(new Set(photos.map((p) => p.locationDetail).filter((v): v is string => !!v))).map(
              (loc) => (
                <option key={loc} value={loc} />
              )
            )}
          </datalist>
          <p className="text-xs text-stone-500 mt-1">
            Aide l&apos;IA à savoir où elle regarde dans le bâtiment — un mot ou deux suffisent.
          </p>
        </div>

        <input
          key={inputKey}
          ref={fileInputRef}
          type="file"
          accept="image/*"
          // Pas de capture="environment" : forcer l'intent caméra direct est
          // documenté comme peu fiable sur Chrome Android 14/15 (l'intent
          // échoue silencieusement après la première capture, sans erreur
          // possible côté JS). Le sélecteur complet de Chrome (galerie +
          // appareil photo en option) est plus lent d'un tap mais nettement
          // plus fiable — confirmé stable sur iPad, le problème était
          // spécifique à ce chemin forcé.
          multiple
          className="hidden"
          onChange={(e) => {
            logDebug(`change: ${e.target.files?.length ?? 0} fichier(s)`)
            handleFiles(e.target.files).catch((err) =>
              setError(describeError(err, "Erreur lors de l'ajout des photos"))
            )
            // Remonte un input tout neuf pour la prochaine capture — sur
            // certaines versions de Chrome Android, .value = '' ne suffit pas
            // toujours à réarmer le sélecteur caméra, qui reste "coincé" après
            // un intent précédent et n'en relance aucun nouveau, sans la
            // moindre erreur JS puisque change ne se déclenche simplement
            // jamais dans ce cas.
            setInputKey((k) => k + 1)
          }}
        />

        <button
          onClick={() => {
            logDebug('clic Ajouter des photos')
            fileInputRef.current?.click()
          }}
          disabled={photoLimit != null && photos.length >= photoLimit}
          className="w-full rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 text-blue-700 py-8 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {photoLimit != null && photos.length >= photoLimit
            ? `Limite de ${photoLimit} photos atteinte`
            : '📷 Ajouter des photos'}
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
              {p.locationDetail && (
                <span className="absolute bottom-1 right-1 bg-blue-600/80 text-white text-[10px] px-1.5 py-0.5 rounded max-w-[70%] truncate">
                  {p.locationDetail}
                </span>
              )}
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
