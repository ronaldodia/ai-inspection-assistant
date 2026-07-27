'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useRequireAuth } from '@/lib/useRequireAuth'
import { api } from '@/lib/api'

interface Anomaly {
  severity: string
}

interface InspectionDetail {
  inspection: { address: string; completed_at: string | null }
  photos: { anomalies: Anomaly[] | null }[]
  report: { synthesis: string | null; report_number: string | null } | null
}

export default function ReportPage() {
  const token = useRequireAuth()
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<InspectionDetail | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!token) return
    api.getInspection(params.id).then(setData)
  }, [token, params.id])

  async function handleDownload() {
    setDownloading(true)
    try {
      const url = await api.fetchBlobUrl(`/api/inspections/${params.id}/report.pdf`)
      const a = document.createElement('a')
      a.href = url
      a.download = `rapport-${params.id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  if (!token || !data) return null

  const findings = data.photos.flatMap((p) => p.anomalies ?? [])
  const counts: Record<string, number> = { critique: 0, majeure: 0, mineure: 0 }
  findings.forEach((f) => {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1
  })

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="bg-white border-b border-stone-200 px-4 py-3">
        <button onClick={() => router.push('/dashboard')} className="text-stone-500 text-sm">
          ← Retour
        </button>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        <div className="bg-white rounded-lg border border-stone-200 p-4">
          <p className="text-lg font-semibold text-stone-900">✅ Rapport prêt</p>
          <p className="text-sm text-stone-500 mt-1">{data.inspection.address}</p>
          {data.inspection.completed_at && (
            <p className="text-sm text-stone-500">
              {new Date(data.inspection.completed_at).toLocaleDateString('fr-CA')}
            </p>
          )}
          {data.report?.report_number && (
            <p className="text-sm text-stone-500">N° de rapport : {data.report.report_number}</p>
          )}
        </div>

        <div className="bg-white rounded-lg border border-stone-200 p-4">
          <p className="font-medium text-stone-900 mb-2">Anomalies détectées : {findings.length}</p>
          <div className="flex gap-3 text-sm">
            <span className="text-red-600">🔴 Critique : {counts.critique}</span>
            <span className="text-amber-600">🟠 Majeure : {counts.majeure}</span>
            <span className="text-yellow-600">🟡 Mineure : {counts.mineure}</span>
          </div>
        </div>

        {data.report?.synthesis && (
          <div className="bg-white rounded-lg border border-stone-200 p-4 text-sm text-stone-700 whitespace-pre-wrap">
            {data.report.synthesis}
          </div>
        )}

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full rounded bg-blue-600 text-white py-3 font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {downloading ? 'Préparation...' : '📥 Télécharger le PDF'}
        </button>
      </main>
    </div>
  )
}
