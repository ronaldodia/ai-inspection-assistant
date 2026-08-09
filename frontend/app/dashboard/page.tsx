'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRequireAuth } from '@/lib/useRequireAuth'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

interface InspectionSummary {
  id: string
  address: string
  status: string
  created_at: string
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  QUEUED: "En file d'attente",
  PROCESSING: 'Analyse en cours',
  REVIEW: 'À réviser',
  COMPLETED: 'Terminée',
  ERROR: 'Erreur',
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-stone-200 text-stone-700',
  QUEUED: 'bg-amber-100 text-amber-800',
  PROCESSING: 'bg-amber-100 text-amber-800',
  REVIEW: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  ERROR: 'bg-red-100 text-red-800',
}

function statusHref(id: string, status: string) {
  switch (status) {
    case 'DRAFT':
    case 'ERROR':
      return `/inspections/${id}/capture`
    case 'REVIEW':
      return `/inspections/${id}/review`
    case 'COMPLETED':
      return `/inspections/${id}/report`
    default:
      return `/inspections/${id}`
  }
}

export default function DashboardPage() {
  const token = useRequireAuth()
  const logout = useAuthStore((s) => s.logout)
  const [inspections, setInspections] = useState<InspectionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!token) return
    api
      .listInspections()
      .then(setInspections)
      .finally(() => setLoading(false))
    api.getProfile().then((p) => setIsAdmin(p.role === 'admin'))
  }, [token])

  if (!token) return null

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between">
        <h1 className="font-semibold text-stone-900">Inspect IA</h1>
        <div className="flex items-center gap-4">
          {isAdmin && (
            <Link href="/admin" className="text-sm text-stone-500 hover:text-stone-700">
              Administration
            </Link>
          )}
          <Link href="/profile" className="text-sm text-stone-500 hover:text-stone-700">
            Mon profil
          </Link>
          <button onClick={logout} className="text-sm text-stone-500 hover:text-stone-700">
            Déconnexion
          </button>
        </div>
      </header>
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <Link
          href="/inspections/new"
          className="block w-full text-center rounded bg-blue-600 text-white py-3 font-medium hover:bg-blue-700"
        >
          + Nouvelle inspection
        </Link>

        {loading && <p className="text-stone-500 text-sm">Chargement...</p>}

        <div className="space-y-2">
          {inspections.map((i) => (
            <Link
              key={i.id}
              href={statusHref(i.id, i.status)}
              className="block bg-white rounded-lg border border-stone-200 p-4 hover:border-stone-300"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-stone-900">{i.address}</p>
                  <p className="text-sm text-stone-500">
                    {new Date(i.created_at).toLocaleDateString('fr-CA')}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[i.status] ?? ''}`}>
                  {STATUS_LABELS[i.status] ?? i.status}
                </span>
              </div>
            </Link>
          ))}
          {!loading && inspections.length === 0 && (
            <p className="text-stone-500 text-sm text-center py-8">Aucune inspection pour l&apos;instant.</p>
          )}
        </div>
      </main>
    </div>
  )
}
