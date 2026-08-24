export const MANDATE_TYPES: [string, string][] = [
  ['preachat', 'Préachat'],
  ['prevente', 'Prévente'],
  ['prereception', 'Pré-réception'],
  ['expertise', 'Expertise'],
  ['general', 'Général'],
]

export const BUILDING_TYPES: [string, string][] = [
  ['maison_unifamiliale', 'Maison unifamiliale'],
  ['jumele', 'Jumelé'],
  ['duplex_triplex', 'Duplex / triplex'],
  ['copropriete', 'Copropriété (condo)'],
  ['multiplex', 'Multiplex (4 logements et +)'],
  ['commercial', 'Commercial'],
  ['autre', 'Autre'],
]

export const WEATHER_CONDITIONS: [string, string][] = [
  ['ensoleille', 'Ensoleillé'],
  ['nuageux', 'Nuageux'],
  ['pluie', 'Pluie'],
  ['neige', 'Neige'],
  ['brouillard', 'Brouillard'],
  ['autre', 'Autre'],
]

export const CHECKLIST_STATUSES: [string, string][] = [
  ['non_inspecte', 'Non inspecté'],
  ['conforme', 'Conforme'],
  ['a_surveiller', 'À surveiller'],
  ['deficient', 'Déficient'],
  ['sans_objet', 'Sans objet'],
]

export const SEVERITIES: [string, string][] = [
  ['securite', 'Sécurité'],
  ['majeur', 'Majeur'],
  ['mineur', 'Mineur'],
  ['entretien', 'Entretien'],
  ['observation', 'Observation'],
]

export const FLOOR_COUNTS: [string, string][] = [
  ['1', '1'],
  ['1.5', '1.5'],
  ['2', '2'],
  ['2.5', '2.5'],
  ['3+', '3+'],
]

export const FOUNDATION_TYPES: [string, string][] = [
  ['beton_coule', 'Béton coulé'],
  ['blocs_beton', 'Blocs de béton'],
  ['pierre', 'Pierre'],
  ['pieux', 'Pieux'],
  ['dalle', 'Dalle'],
]

export const HEATING_TYPES: [string, string][] = [
  ['electrique', 'Électrique'],
  ['gaz_naturel', 'Gaz naturel'],
  ['mazout', 'Mazout'],
  ['thermopompe', 'Thermopompe'],
  ['bienergie', 'Biénergie'],
]

export const YES_NO_PARTIAL: [string, string][] = [
  ['oui', 'Oui'],
  ['non', 'Non'],
  ['partiel', 'Partiel'],
]

export const YES_NO: [string, string][] = [
  ['oui', 'Oui'],
  ['non', 'Non'],
]

// Checklist Sécurité des personnes (Section 11 AIBQ) — vocabulaire Oui/Non/N.A.
// distinct de CHECKLIST_STATUSES (5 valeurs, conforme/déficient/...), car il
// s'agit d'une vérification de présence, pas d'une recherche de défaut visuel.
export const SECURITY_CHECKLIST_ITEMS: [string, string][] = [
  ['detecteur_fumee_niveaux', 'Détecteur de fumée à chaque niveau'],
  ['detecteur_fumee_chambres', 'Détecteur de fumée dans chaque chambre'],
  ['detecteur_co', 'Détecteur de monoxyde de carbone (si combustion/garage)'],
  ['garde_corps_escalier', "Garde-corps en haut d'escalier"],
  ['main_courante', 'Main courante présente'],
  ['porte_garage_renversement', 'Porte de garage avec renversement automatique'],
  ['odeur_gaz', 'Odeur de gaz détectée'],
]

export const SECURITY_STATUSES: [string, string][] = [
  ['na', 'N/A'],
  ['oui', 'Oui'],
  ['non', 'Non'],
]

// Valeur qui doit déclencher une alerte visuelle — "non" (absence d'un élément
// de sécurité) pour la plupart des items, "oui" pour odeur_gaz (le document
// source AIBQ est explicite : "QUITTER IMMÉDIATEMENT").
export const SECURITY_ALERT_VALUE: Record<string, string> = {
  detecteur_fumee_niveaux: 'non',
  detecteur_fumee_chambres: 'non',
  detecteur_co: 'non',
  garde_corps_escalier: 'non',
  main_courante: 'non',
  porte_garage_renversement: 'non',
  odeur_gaz: 'oui',
}
