export const SECTION_TYPES: [string, string][] = [
  ['comble', 'Comble'],
  ['vide_sanitaire', 'Vide sanitaire'],
  ['autre', 'Autre'],
]

export const SECTION_LABELS: Record<string, string> = Object.fromEntries(SECTION_TYPES)

export function sectionLabel(sectionType: string): string {
  return SECTION_LABELS[sectionType] ?? sectionType
}
