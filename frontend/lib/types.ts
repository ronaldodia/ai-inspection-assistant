export interface Anomaly {
  type: string
  severity: string
  location: string
  description: string
  recommendation: string
}

export interface Photo {
  id: string
  section_type: string
  anomalies: Anomaly[] | null
  overall_condition: string | null
}

export interface ChecklistItem {
  system_type: string
  status: string
  notes: string | null
  updated_at?: string
}

export interface DisclosureItem {
  category: string
  type: string
  description: string
  year: number | null
}

export interface Inspection {
  id: string
  address: string
  status: string
  inspection_type: string
  building_type: string | null
  year_built: number | null
  client_name: string | null
  weather_conditions: string | null
  temperature_celsius: number | null
  humidity_percent: number | null
  disclosure_items: DisclosureItem[]
  completed_at: string | null
}

export interface InspectionDetail {
  inspection: Inspection
  photos: Photo[]
  checklist: ChecklistItem[]
  report: { synthesis: string | null; report_number: string | null } | null
}
