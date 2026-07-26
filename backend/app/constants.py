SECTION_LABELS = {
    "comble": "Comble",
    "vide_sanitaire": "Vide sanitaire",
    "autre": "Autre",
}


def section_label(section_type: str) -> str:
    return SECTION_LABELS.get(section_type, section_type)
