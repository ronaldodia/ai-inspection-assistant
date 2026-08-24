SECTION_LABELS = {
    "structure": "Structure",
    "exterieur": "Extérieur",
    "toiture": "Toiture",
    "plomberie": "Plomberie",
    "electricite": "Électricité",
    "chauffage": "Chauffage",
    "climatisation_ventilation_mecanique": "Climatisation et ventilation mécanique",
    "interieur": "Intérieur",
    "isolation": "Isolation",
    "ventilation": "Ventilation",
    "securite": "Sécurité des personnes",
    "autre": "Autre",
}


def section_label(section_type: str) -> str:
    return SECTION_LABELS.get(section_type, section_type)


BUILDING_TYPE_LABELS = {
    "maison_unifamiliale": "Maison unifamiliale",
    "jumele": "Jumelé",
    "duplex_triplex": "Duplex / triplex",
    "copropriete": "Copropriété (condo)",
    "multiplex": "Multiplex (4 logements et +)",
    "commercial": "Commercial",
    "autre": "Autre",
}


def building_type_label(building_type: str | None) -> str:
    if not building_type:
        return ""
    return BUILDING_TYPE_LABELS.get(building_type, building_type)


MANDATE_TYPE_LABELS = {
    "preachat": "Préachat",
    "prevente": "Prévente",
    "prereception": "Pré-réception",
    "expertise": "Expertise",
    "general": "Général",
}


def mandate_type_label(mandate_type: str | None) -> str:
    if not mandate_type:
        return ""
    return MANDATE_TYPE_LABELS.get(mandate_type, mandate_type)


CHECKLIST_STATUS_LABELS = {
    "conforme": "Conforme",
    "deficient": "Déficient",
    "a_surveiller": "À surveiller",
    "non_inspecte": "Non inspecté",
    "sans_objet": "Sans objet",
}


def checklist_status_label(status: str) -> str:
    return CHECKLIST_STATUS_LABELS.get(status, status)


FOUNDATION_TYPE_LABELS = {
    "beton_coule": "Béton coulé",
    "blocs_beton": "Blocs de béton",
    "pierre": "Pierre",
    "pieux": "Pieux",
    "dalle": "Dalle",
}


def foundation_type_label(foundation_type: str | None) -> str:
    if not foundation_type:
        return ""
    return FOUNDATION_TYPE_LABELS.get(foundation_type, foundation_type)


HEATING_TYPE_LABELS = {
    "electrique": "Électrique",
    "gaz_naturel": "Gaz naturel",
    "mazout": "Mazout",
    "thermopompe": "Thermopompe",
    "bienergie": "Biénergie",
}


def heating_type_label(heating_type: str | None) -> str:
    if not heating_type:
        return ""
    return HEATING_TYPE_LABELS.get(heating_type, heating_type)


YES_NO_PARTIAL_LABELS = {"oui": "Oui", "non": "Non", "partiel": "Partiel"}


def yes_no_partial_label(value: str | None) -> str:
    if not value:
        return ""
    return YES_NO_PARTIAL_LABELS.get(value, value)


# Checklist Sécurité des personnes (Section 11 AIBQ) — vocabulaire Oui/Non/N.A.
# distinct de la checklist générique des 11 autres sections (conforme/
# déficient/...), car il s'agit d'une vérification de présence, pas d'une
# recherche de défaut visuel.
SECURITY_CHECKLIST_ITEMS = {
    "detecteur_fumee_niveaux": "Détecteur de fumée à chaque niveau",
    "detecteur_fumee_chambres": "Détecteur de fumée dans chaque chambre",
    "detecteur_co": "Détecteur de monoxyde de carbone (si combustion/garage)",
    "garde_corps_escalier": "Garde-corps en haut d'escalier",
    "main_courante": "Main courante présente",
    "porte_garage_renversement": "Porte de garage avec renversement automatique",
    "odeur_gaz": "Odeur de gaz détectée",
}

SECURITY_STATUS_LABELS = {"oui": "Oui", "non": "Non", "na": "N/A"}


def security_status_label(status: str) -> str:
    return SECURITY_STATUS_LABELS.get(status, status)


def security_item_label(item_key: str) -> str:
    return SECURITY_CHECKLIST_ITEMS.get(item_key, item_key)


# Valeur qui doit déclencher une alerte visuelle — "non" (absence d'un élément
# de sécurité) pour la plupart des items, "oui" pour odeur_gaz (le document
# source est explicite : "QUITTER IMMÉDIATEMENT").
SECURITY_ALERT_VALUE = {
    "detecteur_fumee_niveaux": "non",
    "detecteur_fumee_chambres": "non",
    "detecteur_co": "non",
    "garde_corps_escalier": "non",
    "main_courante": "non",
    "porte_garage_renversement": "non",
    "odeur_gaz": "oui",
}
