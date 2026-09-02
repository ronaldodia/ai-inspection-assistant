'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRequireAuth } from '@/lib/useRequireAuth'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'

export default function ChangePasswordPage() {
  const token = useRequireAuth()
  const router = useRouter()
  const mustChangePassword = useAuthStore((s) => s.mustChangePassword)
  const setMustChangePassword = useAuthStore((s) => s.setMustChangePassword)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError('Le nouveau mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }

    setSaving(true)
    try {
      await api.changePassword(currentPassword, newPassword)
      setMustChangePassword(false)
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  if (!token) return null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm">
        {mustChangePassword && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 text-sm px-3 py-2">
            Pour des raisons de sécurité, vous devez choisir un nouveau mot de passe avant de continuer.
          </div>
        )}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
          <h1 className="text-lg font-medium text-stone-700">Changer le mot de passe</h1>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Mot de passe actuel</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Nouveau mot de passe</label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-stone-500 mt-1">Minimum 8 caractères.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Confirmer le nouveau mot de passe</label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded bg-blue-600 text-white py-2 font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Changer le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  )
}
