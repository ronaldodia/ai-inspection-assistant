'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRequireAuth } from '@/lib/useRequireAuth'
import { api } from '@/lib/api'

function getLocation(): Promise<{ lat: number | null; lon: number | null }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ lat: null, lon: null })
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve({ lat: null, lon: null }),
      { timeout: 5000 }
    )
  })
}

export default function NewInspectionPage() {
  const token = useRequireAuth()
  const router = useRouter()
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { lat, lon } = await getLocation()
      const inspection = await api.createInspection({
        address,
        notes,
        lat,
        lon,
      })
      router.push(`/inspections/${inspection.id}/capture`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  if (!token) return null

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-6">
      <div className="max-w-lg mx-auto">
        <h1 className="text-lg font-semibold text-stone-900 mb-4">Nouvelle inspection</h1>
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-stone-200 p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Adresse</label>
            <input
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Rue de Montréal, Montréal, QC"
              className="w-full rounded border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <p className="text-xs text-stone-500">
            Vous pourrez répartir les photos entre plusieurs sections du bâtiment (comble, vide
            sanitaire, etc.) à l&apos;étape suivante.
          </p>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-blue-600 text-white py-2 font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Création...' : "Commencer l'inspection"}
          </button>
        </form>
      </div>
    </div>
  )
}
