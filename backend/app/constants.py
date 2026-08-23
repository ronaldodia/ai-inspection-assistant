SECTION_LABELS = {
    "exterieur": "Extérieur",
    "toiture": "Toiture",
    "structure": "Structure",
    "fondation": "Fondation",
    "vide_sanitaire": "Vide sanitaire",
    "plomberie": "Plomberie",
    "electricite": "Électricité",
    "chauffage_ventilation": "Chauffage et ventilation",
    "isolation": "Isolation",
    "interieur": "Intérieur",
    "comble": "Comble",
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
