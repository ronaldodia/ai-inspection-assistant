'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRequireAuth } from '@/lib/useRequireAuth'
import { api } from '@/lib/api'
import {
  BUILDING_TYPES,
  FLOOR_COUNTS,
  FOUNDATION_TYPES,
  HEATING_TYPES,
  MANDATE_TYPES,
  WEATHER_CONDITIONS,
  YES_NO,
  YES_NO_PARTIAL,
} from '@/lib/inspectionOptions'
import { sectionLabel } from '@/lib/sections'
import type { DisclosureItem } from '@/lib/types'

const DISCLOSURE_TYPE_LABELS: Record<string, string> = {
  vice_connu: 'Vice connu',
  renovation: 'Rénovation',
  systeme_present: 'Système présent',
  garantie: 'Garantie',
  observation: 'Observation',
}

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
  const [inspectionType, setInspectionType] = useState('preachat')
  const [buildingType, setBuildingType] = useState('')
  const [yearBuilt, setYearBuilt] = useState('')
  const [clientName, setClientName] = useState('')
  const [weatherConditions, setWeatherConditions] = useState('')
  const [temperatureCelsius, setTemperatureCelsius] = useState('')
  const [humidityPercent, setHumidityPercent] = useState('')
  const [floorCount, setFloorCount] = useState('')
  const [areaSqft, setAreaSqft] = useState('')
  const [foundationType, setFoundationType] = useState('')
  const [heatingType, setHeatingType] = useState('')
  const [lastRenovationYear, setLastRenovationYear] = useState('')
  const [hasBasement, setHasBasement] = useState('')
  const [hasCrawlspace, setHasCrawlspace] = useState('')
  const [hasAttic, setHasAttic] = useState('')
  const [disclosureItems, setDisclosureItems] = useState<DisclosureItem[]>([])
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDisclosureUpload(file: File) {
    setExtracting(true)
    setExtractError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await api.extractDisclosure(formData)
      if (result.address) setAddress(result.address)
      if (result.building_type) setBuildingType(result.building_type)
      if (result.year_built) setYearBuilt(String(result.year_built))
      setDisclosureItems(result.disclosure_items ?? [])
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Erreur lors de l'extraction")
    } finally {
      setExtracting(false)
    }
  }

  function removeDisclosureItem(index: number) {
    setDisclosureItems((items) => items.filter((_, i) => i !== index))
  }

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
        inspection_type: inspectionType,
        building_type: buildingType || null,
        year_built: yearBuilt ? Number(yearBuilt) : null,
        client_name: clientName || null,
        weather_conditions: weatherConditions || null,
        temperature_celsius: temperatureCelsius ? Number(temperatureCelsius) : null,
        humidity_percent: humidityPercent ? Number(humidityPercent) : null,
        floor_count: floorCount || null,
        area_sqft: areaSqft ? Number(areaSqft) : null,
        foundation_type: foundationType || null,
        heating_type: heatingType || null,
        last_renovation_year: lastRenovationYear ? Number(lastRenovationYear) : null,
        has_basement: hasBasement || null,
        has_crawlspace: hasCrawlspace || null,
        has_attic: hasAttic || null,
        disclosure_items: disclosureItems,
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

        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 mb-4">
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Préremplir à partir de la déclaration du vendeur (optionnel)
          </label>
          <input
            type="file"
            accept="application/pdf,image/*"
            disabled={extracting}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleDisclosureUpload(file)
              e.target.value = ''
            }}
            className="text-sm"
          />
          {extracting && <p className="text-sm text-stone-500 mt-2">Lecture du document...</p>}
          {extractError && <p className="text-sm text-red-600 mt-2">{extractError}</p>}
          {disclosureItems.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-medium text-stone-500">
                {disclosureItems.length} élément(s) extrait(s) — vérifiez avant de continuer :
              </p>
              {disclosureItems.map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-xs bg-white rounded border border-stone-200 px-2 py-1.5">
                  <span className="flex-1">
                    <span className="font-medium">{sectionLabel(item.category)}</span>
                    {' — '}
                    <span className="text-stone-500">{DISCLOSURE_TYPE_LABELS[item.type] ?? item.type}</span>
                    {' : '}
                    {item.description}
                    {item.year ? ` (${item.year})` : ''}
                  </span>
                  <button type="button" onClick={() => removeDisclosureItem(i)} className="text-red-500 flex-shrink-0">
                    Retirer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Type de mandat</label>
              <select
                value={inspectionType}
                onChange={(e) => setInspectionType(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2"
              >
                {MANDATE_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Type de bâtiment</label>
              <select
                value={buildingType}
                onChange={(e) => setBuildingType(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2"
              >
                <option value="">Non précisé</option>
                {BUILDING_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Année de construction</label>
              <input
                type="number"
                value={yearBuilt}
                onChange={(e) => setYearBuilt(e.target.value)}
                placeholder="1985"
                className="w-full rounded border border-stone-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Client (optionnel)</label>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2"
              />
            </div>
          </div>

          <p className="text-xs text-stone-500">
            Vous pourrez répartir les photos entre plusieurs systèmes du bâtiment (toiture,
            structure, fondation, plomberie, etc.) à l&apos;étape suivante.
          </p>

          <fieldset className="border border-stone-200 rounded p-3">
            <legend className="text-sm font-medium text-stone-700 px-1">Conditions au moment de l&apos;inspection</legend>
            <div className="grid grid-cols-3 gap-3 mt-1">
              <div>
                <label className="block text-xs text-stone-500 mb-1">Météo</label>
                <select
                  value={weatherConditions}
                  onChange={(e) => setWeatherConditions(e.target.value)}
                  className="w-full rounded border border-stone-300 px-2 py-2 text-sm"
                >
                  <option value="">—</option>
                  {WEATHER_CONDITIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Température (°C)</label>
                <input
                  type="number"
                  value={temperatureCelsius}
                  onChange={(e) => setTemperatureCelsius(e.target.value)}
                  className="w-full rounded border border-stone-300 px-2 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Humidité (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={humidityPercent}
                  onChange={(e) => setHumidityPercent(e.target.value)}
                  className="w-full rounded border border-stone-300 px-2 py-2 text-sm"
                />
              </div>
            </div>
          </fieldset>

          <details className="border border-stone-200 rounded p-3">
            <summary className="text-sm font-medium text-stone-700 cursor-pointer">
              Détails du bâtiment (optionnel)
            </summary>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs text-stone-500 mb-1">Nombre d&apos;étages</label>
                <select
                  value={floorCount}
                  onChange={(e) => setFloorCount(e.target.value)}
                  className="w-full rounded border border-stone-300 px-2 py-2 text-sm"
                >
                  <option value="">—</option>
                  {FLOOR_COUNTS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Superficie (pi²)</label>
                <input
                  type="number"
                  value={areaSqft}
                  onChange={(e) => setAreaSqft(e.target.value)}
                  className="w-full rounded border border-stone-300 px-2 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Type de fondation</label>
                <select
                  value={foundationType}
                  onChange={(e) => setFoundationType(e.target.value)}
                  className="w-full rounded border border-stone-300 px-2 py-2 text-sm"
                >
                  <option value="">—</option>
                  {FOUNDATION_TYPES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Type de chauffage</label>
                <select
                  value={heatingType}
                  onChange={(e) => setHeatingType(e.target.value)}
                  className="w-full rounded border border-stone-300 px-2 py-2 text-sm"
                >
                  <option value="">—</option>
                  {HEATING_TYPES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Dernière rénovation majeure</label>
                <input
                  type="number"
                  value={lastRenovationYear}
                  onChange={(e) => setLastRenovationYear(e.target.value)}
                  placeholder="Année, si connue"
                  className="w-full rounded border border-stone-300 px-2 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Sous-sol</label>
                <select
                  value={hasBasement}
                  onChange={(e) => setHasBasement(e.target.value)}
                  className="w-full rounded border border-stone-300 px-2 py-2 text-sm"
                >
                  <option value="">—</option>
                  {YES_NO_PARTIAL.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Vide sanitaire</label>
                <select
                  value={hasCrawlspace}
                  onChange={(e) => setHasCrawlspace(e.target.value)}
                  className="w-full rounded border border-stone-300 px-2 py-2 text-sm"
                >
                  <option value="">—</option>
                  {YES_NO.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Comble</label>
                <select
                  value={hasAttic}
                  onChange={(e) => setHasAttic(e.target.value)}
                  className="w-full rounded border border-stone-300 px-2 py-2 text-sm"
                >
                  <option value="">—</option>
                  {YES_NO.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </details>

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
