import { useAuthStore } from './store'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function request(path: string, options: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().token
  const headers = new Headers(options.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })

  if (res.status === 401) {
    useAuthStore.getState().logout()
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new Error('Non authentifié')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Erreur ${res.status}`)
  }
  return res
}

async function fetchBlobUrl(path: string): Promise<string> {
  const res = await request(path)
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export const api = {
  login: (email: string, password: string) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }).then((r) => r.json()),

  createInspection: (data: Record<string, unknown>) =>
    request('/api/inspections', { method: 'POST', body: JSON.stringify(data) }).then((r) => r.json()),

  extractDisclosure: (formData: FormData) =>
    request('/api/inspections/extract-disclosure', { method: 'POST', body: formData }).then((r) => r.json()),

  listInspections: () => request('/api/inspections').then((r) => r.json()),

  getInspection: (id: string) => request(`/api/inspections/${id}`).then((r) => r.json()),

  uploadPhoto: (inspectionId: string, formData: FormData) =>
    request(`/api/inspections/${inspectionId}/photos`, { method: 'POST', body: formData }).then((r) =>
      r.json()
    ),

  deletePhoto: (inspectionId: string, photoId: string) =>
    request(`/api/inspections/${inspectionId}/photos/${photoId}`, { method: 'DELETE' }).then((r) => r.json()),

  queueInspection: (id: string) =>
    request(`/api/inspections/${id}/queue`, { method: 'POST' }).then((r) => r.json()),

  updateAnomaly: (inspectionId: string, photoId: string, data: Record<string, unknown>) =>
    request(`/api/inspections/${inspectionId}/photos/${photoId}/anomalies`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  updateChecklistItem: (inspectionId: string, systemType: string, data: Record<string, unknown>) =>
    request(`/api/inspections/${inspectionId}/checklist/${systemType}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  updateSecurityChecklistItem: (inspectionId: string, itemKey: string, data: Record<string, unknown>) =>
    request(`/api/inspections/${inspectionId}/security-checklist/${itemKey}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  updateSynthesis: (inspectionId: string, synthesis: string) =>
    request(`/api/inspections/${inspectionId}/synthesis`, {
      method: 'PATCH',
      body: JSON.stringify({ synthesis }),
    }).then((r) => r.json()),

  finalize: (id: string) => request(`/api/inspections/${id}/finalize`, { method: 'POST' }).then((r) => r.json()),

  getProfile: () =>
    request('/api/auth/me')
      .then((r) => r.json())
      .then((profile) => {
        // Garde le flag de la session synchronisé même hors du flux de login
        // (ex. mdp réinitialisé par un admin pendant qu'une session est déjà ouverte).
        useAuthStore.getState().setMustChangePassword(!!profile.must_change_password)
        return profile
      }),

  updateProfile: (data: { full_name: string; certification: string | null }) =>
    request('/api/auth/me', { method: 'PATCH', body: JSON.stringify(data) }).then((r) => r.json()),

  changePassword: (currentPassword: string, newPassword: string) =>
    request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }).then((r) => r.json()),

  listInspectors: () => request('/api/admin/inspectors').then((r) => r.json()),

  createInspector: (data: Record<string, unknown>) =>
    request('/api/admin/inspectors', { method: 'POST', body: JSON.stringify(data) }).then((r) => r.json()),

  updateInspector: (id: string, data: Record<string, unknown>) =>
    request(`/api/admin/inspectors/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then((r) =>
      r.json()
    ),

  resetInspectorPassword: (id: string, password: string) =>
    request(`/api/admin/inspectors/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }).then((r) => r.json()),

  getAdminStats: () => request('/api/admin/stats').then((r) => r.json()),

  fetchBlobUrl,
}
