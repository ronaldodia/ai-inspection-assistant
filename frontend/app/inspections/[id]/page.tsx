'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useRequireAuth } from '@/lib/useRequireAuth'
import { api } from '@/lib/api'

const POLL_INTERVAL_MS = 4000
const MAX_CONSECUTIVE_FAILURES = 3

export default function InspectionStatusPage() {
  const token = useRequireAuth()
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [status, setStatus] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [analyzedCount, setAnalyzedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [connectionLost, setConnectionLost] = useState(false)
  const failuresRef = useRef(0)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    async function poll() {
      try {
        const data = await api.getInspection(params.id)
        if (cancelled) return
        failuresRef.current = 0
        setConnectionLost(false)
        setStatus(data.inspection.status)
        setErrorMessage(data.inspection.error_message)
        setTotalCount(data.photos.length)
        setAnalyzedCount(data.photos.filter((p: { anomalies: unknown }) => p.anomalies !== null).length)
        if (data.inspection.status === 'REVIEW') {
          router.replace(`/inspections/${params.id}/review`)
        } else if (data.inspection.status === 'COMPLETED') {
          router.replace(`/inspections/${params.id}/report`)
        } else if (data.inspection.status === 'DRAFT') {
          router.replace(`/inspections/${params.id}/capture`)
        }
      } catch {
        if (cancelled) return
        failuresRef.current += 1
        if (failuresRef.current >= MAX_CONSECUTIVE_FAILURES) setConnectionLost(true)
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [token, params.id, router])

  if (!token) return null

  const progressPct = totalCount > 0 ? Math.round((analyzedCount / totalCount) * 100) : 0

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        {status === 'ERROR' ? (
          <>
            <p className="text-red-600 font-medium">Une erreur est survenue pendant l&apos;analyse.</p>
            {errorMessage && <p className="text-xs text-stone-500 break-words">{errorMessage}</p>}
            <button
              onClick={() => api.queueInspection(params.id).then(() => setStatus('QUEUED'))}
              className="rounded bg-blue-600 text-white px-4 py-2 font-medium"
            >
              Relancer l&apos;analyse
            </button>
          </>
        ) : (
          <>
            <div className="animate-pulse text-4xl">⏳</div>
            {status === 'PROCESSING' && totalCount > 0 ? (
              <>
                <p className="text-stone-600">
                  {analyzedCount < totalCount
                    ? `Analyse des photos par l'IA en cours (${analyzedCount}/${totalCount})...`
                    : 'Génération de la synthèse du rapport...'}
                </p>
                <div className="w-full h-2 rounded-full bg-stone-200 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-stone-600">
                {status === 'QUEUED' ? "Inspection en file d'attente..." : 'Chargement...'}
              </p>
            )}
            {connectionLost && (
              <p className="text-xs text-amber-600">
                Connexion instable — nouvelle tentative en cours...
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
