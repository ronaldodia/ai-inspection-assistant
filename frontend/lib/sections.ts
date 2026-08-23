export const SECTION_TYPES: [string, string][] = [
  ['structure', 'Structure'],
  ['exterieur', 'Extérieur'],
  ['toiture', 'Toiture'],
  ['plomberie', 'Plomberie'],
  ['electricite', 'Électricité'],
  ['chauffage', 'Chauffage'],
  ['climatisation_ventilation_mecanique', 'Climatisation et ventilation mécanique'],
  ['interieur', 'Intérieur'],
  ['isolation', 'Isolation'],
  ['ventilation', 'Ventilation'],
  ['securite', 'Sécurité des personnes'],
  ['autre', 'Autre'],
]

export const SECTION_LABELS: Record<string, string> = Object.fromEntries(SECTION_TYPES)

export function sectionLabel(sectionType: string): string {
  return SECTION_LABELS[sectionType] ?? sectionType
}
