'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRequireAuth } from '@/lib/useRequireAuth'
import { api } from '@/lib/api'

interface Inspector {
  id: string
  email: string
  full_name: string
  certification: string | null
  role: string
  is_active: boolean
  max_inspections: number | null
  max_photos_per_inspection: number | null
  created_at: string
  inspection_count: number
  photo_count: number
}

interface Stats {
  total_inspectors: number
  active_inspectors: number
  total_inspections: number
  total_photos: number
  completed_inspections: number
  by_status: { status: string; count: number }[]
  top_inspectors: { id: string; full_name: string; email: string; inspection_count: number }[]
}

const emptyForm = {
  email: '',
  password: '',
  full_name: '',
  certification: '',
  max_inspections: '',
  max_photos_per_inspection: '',
}

export default function AdminPage() {
  const token = useRequireAuth()
  const router = useRouter()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [inspectors, setInspectors] = useState<Inspector[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!token) return
    api.getProfile().then((p) => {
      if (p.role !== 'admin') {
        router.replace('/dashboard')
        return
      }
      setAuthorized(true)
    })
  }, [token, router])

  function loadData() {
    setLoading(true)
    Promise.all([api.listInspectors(), api.getAdminStats()])
      .then(([i, s]) => {
        setInspectors(i)
        setStats(s)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (authorized) loadData()
  }, [authorized])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      await api.createInspector({
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        certification: form.certification || null,
        max_inspections: form.max_inspections ? Number(form.max_inspections) : null,
        max_photos_per_inspection: form.max_photos_per_inspection
          ? Number(form.max_photos_per_inspection)
          : null,
      })
      setForm(emptyForm)
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setCreating(false)
    }
  }

  async function toggleActive(inspector: Inspector) {
    setError(null)
    try {
      await api.updateInspector(inspector.id, { is_active: !inspector.is_active })
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  async function updateLimits(inspector: Inspector, field: 'max_inspections' | 'max_photos_per_inspection') {
    const value = window.prompt(
      `Nouvelle limite pour ${inspector.full_name} (vide = limite par défaut) :`,
      inspector[field] === null ? '' : String(inspector[field])
    )
    if (value === null) return
    setError(null)
    try {
      await api.updateInspector(inspector.id, { [field]: value === '' ? null : Number(value) })
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  async function updateFullName(inspector: Inspector) {
    const value = window.prompt(`Nouveau nom pour ${inspector.full_name} :`, inspector.full_name)
    if (value === null || value.trim() === '') return
    setError(null)
    try {
      await api.updateInspector(inspector.id, { full_name: value.trim() })
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  async function updateCertification(inspector: Inspector) {
    const value = window.prompt(
      `Certification pour ${inspector.full_name} (vide = aucune) :`,
      inspector.certification ?? ''
    )
    if (value === null) return
    setError(null)
    try {
      await api.updateInspector(inspector.id, { certification: value.trim() || null })
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  async function handleResetPassword(inspector: Inspector) {
    const password = window.prompt(`Nouveau mot de passe pour ${inspector.full_name} (min. 8 caractères) :`)
    if (!password) return
    setError(null)
    try {
      await api.resetInspectorPassword(inspector.id, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  if (!token || !authorized) return null

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between">
        <h1 className="font-semibold text-stone-900">Administration</h1>
        <Link href="/dashboard" className="text-sm text-stone-500 hover:text-stone-700">
          ← Retour au tableau de bord
        </Link>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {error && <p className="text-sm text-red-600">{error}</p>}

        {stats && (
          <section className="bg-white rounded-lg border border-stone-200 p-4">
            <h2 className="font-medium text-stone-900 mb-3">Statistiques</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <Stat label="Inspecteurs" value={stats.total_inspectors} />
              <Stat label="Inspecteurs actifs" value={stats.active_inspectors} />
              <Stat label="Inspections" value={stats.total_inspections} />
              <Stat label="Photos" value={stats.total_photos} />
            </div>
            <div className="flex flex-wrap gap-2 text-xs mb-4">
              {stats.by_status.map((s) => (
                <span key={s.status} className="bg-stone-100 text-stone-700 px-2 py-1 rounded-full">
                  {s.status}: {s.count}
                </span>
              ))}
            </div>
            <h3 className="text-sm font-medium text-stone-700 mb-2">Top inspecteurs</h3>
            <ul className="text-sm text-stone-600 space-y-1">
              {stats.top_inspectors.map((t) => (
                <li key={t.id}>
                  {t.full_name} ({t.email}) — {t.inspection_count} inspection(s)
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="bg-white rounded-lg border border-stone-200 p-4">
          <h2 className="font-medium text-stone-900 mb-3">Créer un inspecteur</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              required
              type="email"
              placeholder="Courriel"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="rounded border border-stone-300 px-3 py-2"
            />
            <input
              required
              type="password"
              placeholder="Mot de passe (min. 8 caractères)"
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="rounded border border-stone-300 px-3 py-2"
            />
            <input
              required
              placeholder="Nom complet"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="rounded border border-stone-300 px-3 py-2"
            />
            <input
              placeholder="Certification (optionnel)"
              value={form.certification}
              onChange={(e) => setForm({ ...form, certification: e.target.value })}
              className="rounded border border-stone-300 px-3 py-2"
            />
            <input
              type="number"
              min={0}
              placeholder="Limite d'inspections (vide = défaut)"
              value={form.max_inspections}
              onChange={(e) => setForm({ ...form, max_inspections: e.target.value })}
              className="rounded border border-stone-300 px-3 py-2"
            />
            <input
              type="number"
              min={0}
              placeholder="Limite de photos/inspection (vide = défaut)"
              value={form.max_photos_per_inspection}
              onChange={(e) => setForm({ ...form, max_photos_per_inspection: e.target.value })}
              className="rounded border border-stone-300 px-3 py-2"
            />
            <button
              type="submit"
              disabled={creating}
              className="sm:col-span-2 rounded bg-blue-600 text-white py-2 font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? 'Création...' : 'Créer'}
            </button>
          </form>
        </section>

        <section className="bg-white rounded-lg border border-stone-200 p-4">
          <h2 className="font-medium text-stone-900 mb-3">Inspecteurs</h2>
          {loading ? (
            <p className="text-stone-500 text-sm">Chargement...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-stone-500 border-b border-stone-200">
                    <th className="py-2 pr-2">Nom</th>
                    <th className="py-2 pr-2">Courriel</th>
                    <th className="py-2 pr-2">Rôle</th>
                    <th className="py-2 pr-2">Certification</th>
                    <th className="py-2 pr-2">Statut</th>
                    <th className="py-2 pr-2">Inspections</th>
                    <th className="py-2 pr-2">Photos</th>
                    <th className="py-2 pr-2">Limite insp.</th>
                    <th className="py-2 pr-2">Limite photos</th>
                    <th className="py-2 pr-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {inspectors.map((i) => (
                    <tr key={i.id} className="border-b border-stone-100">
                      <td className="py-2 pr-2">
                        <button
                          onClick={() => updateFullName(i)}
                          className="underline text-stone-600 hover:text-stone-900 text-left"
                        >
                          {i.full_name}
                        </button>
                      </td>
                      <td className="py-2 pr-2">{i.email}</td>
                      <td className="py-2 pr-2">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            i.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-stone-100 text-stone-700'
                          }`}
                        >
                          {i.role === 'admin' ? 'Admin' : 'Inspecteur'}
                        </span>
                      </td>
                      <td className="py-2 pr-2">
                        <button
                          onClick={() => updateCertification(i)}
                          className="underline text-stone-600 hover:text-stone-900"
                        >
                          {i.certification || 'aucune'}
                        </button>
                      </td>
                      <td className="py-2 pr-2">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            i.is_active ? 'bg-green-100 text-green-800' : 'bg-stone-200 text-stone-700'
                          }`}
                        >
                          {i.is_active ? 'Actif' : 'Désactivé'}
                        </span>
                      </td>
                      <td className="py-2 pr-2">{i.inspection_count}</td>
                      <td className="py-2 pr-2">{i.photo_count}</td>
                      <td className="py-2 pr-2">
                        <button
                          onClick={() => updateLimits(i, 'max_inspections')}
                          className="underline text-stone-600 hover:text-stone-900"
                        >
                          {i.max_inspections ?? 'défaut'}
                        </button>
                      </td>
                      <td className="py-2 pr-2">
                        <button
                          onClick={() => updateLimits(i, 'max_photos_per_inspection')}
                          className="underline text-stone-600 hover:text-stone-900"
                        >
                          {i.max_photos_per_inspection ?? 'défaut'}
                        </button>
                      </td>
                      <td className="py-2 pr-2 space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => toggleActive(i)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {i.is_active ? 'Désactiver' : 'Activer'}
                        </button>
                        <button
                          onClick={() => handleResetPassword(i)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Réinitialiser mdp
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-semibold text-stone-900">{value}</p>
      <p className="text-xs text-stone-500">{label}</p>
    </div>
  )
}
