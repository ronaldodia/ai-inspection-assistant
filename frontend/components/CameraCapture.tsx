'use client'

import { useEffect, useRef, useState } from 'react'
import { captureVideoFrame } from '@/lib/compress-image'

interface CameraCaptureProps {
  onClose: () => void
  onCapture: (blob: Blob) => Promise<void>
  // Appelé une seule fois si getUserMedia est indisponible ou refusé — le
  // parent doit alors retomber immédiatement sur le sélecteur natif, cette
  // vue ne sait faire que de la caméra en direct, pas de repli elle-même.
  onUnavailable: () => void
  photosTaken: number
  photoLimit: number | null
}

// Overlay plein écran avec aperçu caméra en direct (getUserMedia), pensé
// pour l'Android uniquement (voir page.tsx) : contourne complètement l'intent
// caméra natif dont le processus Chrome est tué par l'OS de façon quasi
// systématique en arrière-plan, cause confirmée des pertes de photos
// silencieuses. Reste ouvert entre les prises (flux "stay open") : l'appareil
// ne quitte jamais le premier plan, donc aucun risque de kill de processus
// pendant une session de capture.
export default function CameraCapture({
  onClose,
  onCapture,
  onUnavailable,
  photosTaken,
  photoLimit,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [shotError, setShotError] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onUnavailable()
      return
    }
    let active = true
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
        setReady(true)
      })
      .catch(() => {
        // Permission refusée, aucune caméra disponible, contrainte non
        // satisfiable... peu importe la raison exacte, le seul comportement
        // sûr est de rebasculer sur le sélecteur natif plutôt que de
        // bloquer l'inspecteur sur un écran caméra mort.
        if (active) onUnavailable()
      })
    return () => {
      active = false
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    // onUnavailable est stable côté appelant (useCallback) — pas de dépendance
    // volontairement pour ne jamais redemander la permission en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const atLimit = photoLimit != null && photosTaken >= photoLimit

  async function handleShutter() {
    const video = videoRef.current
    if (!video || capturing || atLimit || !video.videoWidth) return
    setCapturing(true)
    setShotError(null)
    setFlash(true)
    setTimeout(() => setFlash(false), 150)
    try {
      const blob = await captureVideoFrame(video)
      await onCapture(blob)
    } catch (err) {
      setShotError(err instanceof Error ? err.message : 'Photo non enregistrée — réessayez.')
    } finally {
      setCapturing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <button onClick={onClose} className="rounded-full bg-black/50 w-9 h-9 text-lg" aria-label="Fermer">
          ×
        </button>
        <span className="text-sm bg-black/50 rounded-full px-3 py-1">
          {photosTaken} photo{photosTaken !== 1 ? 's' : ''}
          {photoLimit != null && ` / ${photoLimit}`}
        </span>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
            Ouverture de la caméra…
          </div>
        )}
        {flash && <div className="absolute inset-0 bg-white" />}
      </div>

      <div className="px-4 py-6 bg-black text-center space-y-3">
        {shotError && <p className="text-sm text-red-400">{shotError}</p>}
        {atLimit && (
          <p className="text-sm text-amber-400">
            Limite de {photoLimit} photos atteinte pour cette inspection.
          </p>
        )}
        <button
          onClick={handleShutter}
          disabled={!ready || capturing || atLimit}
          aria-label="Prendre la photo"
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 disabled:opacity-40"
        >
          <span className="h-12 w-12 rounded-full bg-white" />
        </button>
        <button onClick={onClose} className="text-sm text-stone-300 underline">
          Terminé
        </button>
      </div>
    </div>
  )
}
