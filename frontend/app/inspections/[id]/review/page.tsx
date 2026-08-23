'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useRequireAuth } from '@/lib/useRequireAuth'
import { api } from '@/lib/api'
import { sectionLabel } from '@/lib/sections'
import {
  CHECKLIST_STATUSES,
  SECURITY_ALERT_VALUE,
  SECURITY_CHECKLIST_ITEMS,
  SECURITY_STATUSES,
  SEVERITIES,
} from '@/lib/inspectionOptions'
import type {
  Anomaly,
  ChecklistItem,
  DisclosureItem,
  InspectionDetail,
  Photo,
  SecurityChecklistItem,
} from '@/lib/types'

const SECURITY_ITEM_LABELS: Record<string, string> = Object.fromEntries(SECURITY_CHECKLIST_ITEMS)

// Mêmes teintes que SEVERITY_MARKER_COLOR côté backend (backend/app/pdf.py) —
// le repère a la même couleur en révision et dans le rapport PDF final.
const SEVERITY_MARKER_COLOR: Record<string, string> = {
  securite: '#7f1d1d',
  majeur: '#c2410c',
  mineur: '#a16207',
  entretien: '#475569',
  observation: '#78716c',
}

export default function ReviewPage() {
  const token = useRequireAuth()
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<InspectionDetail | null>(null)
  const [synthesis, setSynthesis] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    api.getInspection(params.id).then((d: InspectionDetail) => {
      setData(d)
      setSynthesis(d.report?.synthesis ?? '')
    })
  }, [token, params.id])

  function updatePhotoAnomalies(photoId: string, anomalies: Anomaly[], overallCondition: string) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            photos: prev.photos.map((p) =>
              p.id === photoId ? { ...p, anomalies, overall_condition: overallCondition } : p
            ),
          }
        : prev
    )
  }

  function updateChecklistItem(systemType: string, status: string, notes: string) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            checklist: prev.checklist.map((c) =>
              c.system_type === systemType ? { ...c, status, notes } : c
            ),
          }
        : prev
    )
  }

  function updateSecurityChecklistItem(itemKey: string, status: string, notes: string) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            security_checklist: prev.security_checklist.map((c) =>
              c.item_key === itemKey ? { ...c, status, notes } : c
            ),
          }
        : prev
    )
  }

  async function saveAll() {
    if (!data) return
    setSaving(true)
    setError(null)
    try {
      for (const photo of data.photos) {
        await api.updateAnomaly(params.id, photo.id, {
          anomalies: photo.anomalies ?? [],
          overall_condition: photo.overall_condition ?? 'bon',
        })
      }
      for (const item of data.checklist) {
        await api.updateChecklistItem(params.id, item.system_type, {
          status: item.status,
          notes: item.notes,
        })
      }
      for (const item of data.security_checklist) {
        await api.updateSecurityChecklistItem(params.id, item.item_key, {
          status: item.status,
          notes: item.notes,
        })
      }
      await api.updateSynthesis(params.id, synthesis)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function handleFinalize() {
    setError(null)
    try {
      await saveAll()
      await api.finalize(params.id)
      router.push(`/inspections/${params.id}/report`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la finalisation')
    }
  }

  if (!token || !data) return null

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="bg-white border-b border-stone-200 px-4 py-3">
        <h1 className="font-semibold text-stone-900">Révision — {data.inspection.address}</h1>
        <p className="text-sm text-stone-500">
          Vérifiez les anomalies détectées avant de générer le rapport final.
        </p>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        {data.checklist.length > 0 && (
          <ChecklistPanel
            checklist={data.checklist}
            photos={data.photos}
            disclosureItems={data.inspection.disclosure_items ?? []}
            onChange={updateChecklistItem}
          />
        )}

        {data.security_checklist.length > 0 && (
          <SecurityChecklistPanel
            securityChecklist={data.security_checklist}
            onChange={updateSecurityChecklistItem}
          />
        )}

        <section className="bg-white rounded-lg border border-stone-200 p-4">
          <label className="block text-sm font-medium text-stone-700 mb-2">Synthèse générale</label>
          <textarea
            value={synthesis}
            onChange={(e) => setSynthesis(e.target.value)}
            rows={6}
            className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
          />
        </section>

        {data.photos.map((photo) => (
          <PhotoReviewCard
            key={photo.id}
            photo={photo}
            onChange={(anomalies, condition) => updatePhotoAnomalies(photo.id, anomalies, condition)}
          />
        ))}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 p-4">
        <div className="max-w-2xl mx-auto flex gap-2">
          <button
            onClick={saveAll}
            disabled={saving}
            className="flex-1 rounded border border-stone-300 py-2 font-medium text-stone-700 disabled:opacity-40"
          >
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
          <button
            onClick={handleFinalize}
            className="flex-1 rounded bg-blue-600 text-white py-2 font-medium hover:bg-blue-700"
          >
            Finaliser le rapport
          </button>
        </div>
      </div>
    </div>
  )
}

// Statut suggéré (indicatif seulement, jamais imposé) à partir des anomalies déjà
// détectées pour ce système, pour aider l'inspecteur à démarrer sans tout ressaisir.
function suggestedStatus(systemType: string, photos: Photo[]): string | null {
  const systemPhotos = photos.filter((p) => p.section_type === systemType)
  if (systemPhotos.length === 0) return null
  const anomalies = systemPhotos.flatMap((p) => p.anomalies ?? [])
  if (anomalies.some((a) => a.severity === 'securite' || a.severity === 'majeur')) return 'deficient'
  if (anomalies.length > 0) return 'a_surveiller'
  return 'conforme'
}

function ChecklistPanel({
  checklist,
  photos,
  disclosureItems,
  onChange,
}: {
  checklist: ChecklistItem[]
  photos: Photo[]
  disclosureItems: DisclosureItem[]
  onChange: (systemType: string, status: string, notes: string) => void
}) {
  return (
    <section className="bg-white rounded-lg border border-stone-200 p-4">
      <h2 className="text-sm font-medium text-stone-700 mb-3">État par système</h2>
      <div className="space-y-2">
        {checklist.map((item) => {
          const suggestion = item.status === 'non_inspecte' ? suggestedStatus(item.system_type, photos) : null
          const disclosures = disclosureItems.filter((d) => d.category === item.system_type)
          return (
            <div key={item.system_type} className="border-b border-stone-100 pb-2 last:border-0">
              {disclosures.map((d, i) => (
                <p key={i} className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mb-1">
                  📋 Déclaration du vendeur : {d.description}
                  {d.year ? ` (${d.year})` : ''}
                </p>
              ))}
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm text-stone-700">{sectionLabel(item.system_type)}</span>
                {suggestion && (
                  <button
                    type="button"
                    onClick={() => onChange(item.system_type, suggestion, item.notes ?? '')}
                    className="text-xs text-blue-600"
                    title="Suggestion basée sur les anomalies détectées"
                  >
                    suggéré: {CHECKLIST_STATUSES.find(([v]) => v === suggestion)?.[1]}
                  </button>
                )}
                <select
                  value={item.status}
                  onChange={(e) => onChange(item.system_type, e.target.value, item.notes ?? '')}
                  className="rounded border border-stone-300 px-2 py-1 text-sm"
                >
                  {CHECKLIST_STATUSES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                value={item.notes ?? ''}
                onChange={(e) => onChange(item.system_type, item.status, e.target.value)}
                placeholder="Note (optionnel)"
                className="mt-1 w-full rounded border border-stone-200 px-2 py-1 text-xs"
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SecurityChecklistPanel({
  securityChecklist,
  onChange,
}: {
  securityChecklist: SecurityChecklistItem[]
  onChange: (itemKey: string, status: string, notes: string) => void
}) {
  return (
    <section className="bg-white rounded-lg border border-stone-200 p-4">
      <h2 className="text-sm font-medium text-stone-700 mb-3">Sécurité des personnes</h2>
      <div className="space-y-2">
        {securityChecklist.map((item) => {
          const alert = item.status !== 'na' && item.status === SECURITY_ALERT_VALUE[item.item_key]
          return (
            <div
              key={item.item_key}
              className={`border-b border-stone-100 pb-2 last:border-0 ${alert ? 'bg-red-50 -mx-2 px-2 rounded' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm text-stone-700">
                  {SECURITY_ITEM_LABELS[item.item_key] ?? item.item_key}
                  {alert && ' ⚠️'}
                </span>
                <div className="flex gap-1">
                  {SECURITY_STATUSES.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onChange(item.item_key, value, item.notes ?? '')}
                      className={`rounded border px-2 py-1 text-xs ${
                        item.status === value
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-stone-300 text-stone-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <input
                value={item.notes ?? ''}
                onChange={(e) => onChange(item.item_key, item.status, e.target.value)}
                placeholder="Note (optionnel)"
                className="mt-1 w-full rounded border border-stone-200 px-2 py-1 text-xs"
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function PhotoReviewCard({
  photo,
  onChange,
}: {
  photo: Photo
  onChange: (anomalies: Anomaly[], condition: string) => void
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [placingIndex, setPlacingIndex] = useState<number | null>(null)
  const anomalies: Anomaly[] = photo.anomalies ?? []
  const condition: string = photo.overall_condition ?? 'bon'

  useEffect(() => {
    let objectUrl: string | null = null
    api
      .fetchBlobUrl(`/api/photos/${photo.id}`)
      .then((url) => {
        objectUrl = url
        setImgSrc(url)
      })
      .catch(() => {})
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [photo.id])

  function updateAnomaly(index: number, field: keyof Anomaly, value: string) {
    const next = anomalies.map((a, i) => (i === index ? { ...a, [field]: value } : a))
    onChange(next, condition)
  }

  function setAnomalyMarker(index: number, marker: { x: number; y: number }) {
    const next = anomalies.map((a, i) => (i === index ? { ...a, marker } : a))
    onChange(next, condition)
  }

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (placingIndex === null) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    setAnomalyMarker(placingIndex, { x, y })
    setPlacingIndex(null)
  }

  function removeAnomaly(index: number) {
    onChange(
      anomalies.filter((_, i) => i !== index),
      condition
    )
  }

  function addAnomaly() {
    onChange(
      [...anomalies, { type: 'autre', severity: 'observation', location: '', description: '', recommendation: '' }],
      condition
    )
  }

  return (
    <section className="bg-white rounded-lg border border-stone-200 p-4 space-y-3">
      <div>
        <span className="inline-block text-[10px] font-medium uppercase tracking-wide text-stone-500 bg-stone-100 rounded px-1.5 py-0.5 mb-2">
          {sectionLabel(photo.section_type)}
        </span>
        {photo.location_detail && (
          <span className="inline-block text-[10px] font-medium text-blue-700 bg-blue-50 rounded px-1.5 py-0.5 mb-2 ml-1">
            {photo.location_detail}
          </span>
        )}
      </div>

      {imgSrc && (
        <div
          className={`relative ${placingIndex !== null ? 'cursor-crosshair ring-2 ring-blue-500 rounded' : ''}`}
          onClick={handleImageClick}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgSrc} alt="" className="w-full h-auto rounded" />
          {anomalies.map((a, i) =>
            a.marker ? (
              <span
                key={i}
                className="absolute w-6 h-6 flex items-center justify-center rounded-full bg-white text-[11px] font-bold border-2 pointer-events-none"
                style={{
                  left: `${a.marker.x * 100}%`,
                  top: `${a.marker.y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  borderColor: SEVERITY_MARKER_COLOR[a.severity] ?? '#78716c',
                  color: SEVERITY_MARKER_COLOR[a.severity] ?? '#78716c',
                }}
              >
                {i + 1}
              </span>
            ) : null
          )}
        </div>
      )}
      {placingIndex !== null && (
        <p className="text-xs text-blue-600">Touchez la photo pour placer le repère.</p>
      )}

      <div>
        <label className="block text-xs font-medium text-stone-500 mb-1">État général</label>
        <select
          value={condition}
          onChange={(e) => onChange(anomalies, e.target.value)}
          className="rounded border border-stone-300 px-2 py-1 text-sm"
        >
          <option value="bon">Bon</option>
          <option value="acceptable">Acceptable</option>
          <option value="mauvais">Mauvais</option>
          <option value="critique">Critique</option>
        </select>
      </div>

      {anomalies.map((a, i) => (
        <div key={i} className="border border-stone-100 rounded p-3 space-y-2 bg-stone-50">
          <div className="flex items-center gap-2">
            <input
              value={a.type}
              onChange={(e) => updateAnomaly(i, 'type', e.target.value)}
              placeholder="Type (ex: moisissure)"
              className="flex-1 rounded border border-stone-300 px-2 py-1 text-sm"
            />
            <select
              value={a.severity}
              onChange={(e) => updateAnomaly(i, 'severity', e.target.value)}
              className="rounded border border-stone-300 px-2 py-1 text-sm"
            >
              {SEVERITIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button onClick={() => removeAnomaly(i)} className="text-red-500 text-sm px-2">
              Supprimer
            </button>
          </div>
          <input
            value={a.location}
            onChange={(e) => updateAnomaly(i, 'location', e.target.value)}
            placeholder="Emplacement"
            className="w-full rounded border border-stone-300 px-2 py-1 text-sm"
          />
          <textarea
            value={a.description}
            onChange={(e) => updateAnomaly(i, 'description', e.target.value)}
            placeholder="Description"
            rows={2}
            className="w-full rounded border border-stone-300 px-2 py-1 text-sm"
          />
          <textarea
            value={a.recommendation}
            onChange={(e) => updateAnomaly(i, 'recommendation', e.target.value)}
            placeholder="Recommandation"
            rows={2}
            className="w-full rounded border border-stone-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={() => setPlacingIndex(i)}
            className="text-xs text-blue-600 font-medium"
          >
            {a.marker ? `📍 Repositionner (${i + 1})` : `📍 Marquer sur la photo (${i + 1})`}
          </button>
        </div>
      ))}

      <button onClick={addAnomaly} className="text-sm text-blue-600 font-medium">
        + Ajouter une anomalie
      </button>
    </section>
  )
}
