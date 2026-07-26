'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useRequireAuth } from '@/lib/useRequireAuth'
import { api } from '@/lib/api'

const MESSAGES: Record<string, string> = {
  QUEUED: "Inspection en file d'attente...",
  PROCESSING: "Analyse des photos par l'IA en cours (quelques minutes)...",
}

export default function InspectionStatusPage() {
  const token = useRequireAuth()
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [status, setStatus] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    async function poll() {
      try {
        const data = await api.getInspection(params.id)
        if (cancelled) return
        setStatus(data.inspection.status)
        setErrorMessage(data.inspection.error_message)
        if (data.inspection.status === 'REVIEW') {
          router.replace(`/inspections/${params.id}/review`)
        } else if (data.inspection.status === 'COMPLETED') {
          router.replace(`/inspections/${params.id}/report`)
        } else if (data.inspection.status === 'DRAFT') {
          router.replace(`/inspections/${params.id}/capture`)
        }
      } catch {
        // on retente au prochain intervalle
      }
    }

    poll()
    const interval = setInterval(poll, 4000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [token, params.id, router])

  if (!token) return null

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="max-w-sm text-center space-y-4">
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
            <p className="text-stone-600">{MESSAGES[status ?? ''] ?? 'Chargement...'}</p>
          </>
        )}
      </div>
    </div>
  )
}
