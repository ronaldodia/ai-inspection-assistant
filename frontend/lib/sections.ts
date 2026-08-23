export const SECTION_TYPES: [string, string][] = [
  ['exterieur', 'Extérieur'],
  ['toiture', 'Toiture'],
  ['structure', 'Structure'],
  ['fondation', 'Fondation'],
  ['vide_sanitaire', 'Vide sanitaire'],
  ['plomberie', 'Plomberie'],
  ['electricite', 'Électricité'],
  ['chauffage_ventilation', 'Chauffage et ventilation'],
  ['isolation', 'Isolation'],
  ['interieur', 'Intérieur'],
  ['comble', 'Comble'],
  ['autre', 'Autre'],
]

export const SECTION_LABELS: Record<string, string> = Object.fromEntries(SECTION_TYPES)

export function sectionLabel(sectionType: string): string {
  return SECTION_LABELS[sectionType] ?? sectionType
}
