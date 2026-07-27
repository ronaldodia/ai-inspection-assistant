'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRequireAuth } from '@/lib/useRequireAuth'
import { api } from '@/lib/api'

export default function ProfilePage() {
  const token = useRequireAuth()
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [certification, setCertification] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!token) return
    api
      .getProfile()
      .then((p) => {
        setFullName(p.full_name)
        setCertification(p.certification ?? '')
      })
      .finally(() => setLoading(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      await api.updateProfile({ full_name: fullName, certification: certification || null })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  if (!token) return null

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-6">
      <div className="max-w-lg mx-auto">
        <button onClick={() => router.push('/dashboard')} className="text-stone-500 text-sm mb-4">
          ← Retour
        </button>
        <h1 className="text-lg font-semibold text-stone-900 mb-4">Mon profil</h1>
        {loading ? (
          <p className="text-stone-500 text-sm">Chargement...</p>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-stone-200 p-4 space-y-4">
            <p className="text-xs text-stone-500">
              Ces informations apparaissent sur les rapports d&apos;inspection générés.
            </p>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Nom de l&apos;inspecteur</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Certification (optionnel)</label>
              <input
                value={certification}
                onChange={(e) => setCertification(e.target.value)}
                placeholder="ex : Membre AIBQ #12345"
                className="w-full rounded border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {saved && <p className="text-sm text-green-600">Profil mis à jour.</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded bg-blue-600 text-white py-2 font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
