from app.constants import (
    BUILDING_TYPE_LABELS,
    CHECKLIST_STATUS_LABELS,
    MANDATE_TYPE_LABELS,
    SECTION_LABELS,
    building_type_label,
    checklist_status_label,
    mandate_type_label,
    section_label,
)


def test_section_label_known_types():
    assert section_label("comble") == "Comble"
    assert section_label("vide_sanitaire") == "Vide sanitaire"
    assert section_label("toiture") == "Toiture"
    assert section_label("autre") == "Autre"


def test_section_label_unknown_type_falls_back_to_raw_value():
    assert section_label("sous_sol") == "sous_sol"


def test_section_labels_cover_all_known_section_types():
    assert set(SECTION_LABELS) == {
        "exterieur",
        "toiture",
        "structure",
        "fondation",
        "vide_sanitaire",
        "plomberie",
        "electricite",
        "chauffage_ventilation",
        "isolation",
        "interieur",
        "comble",
        "autre",
    }


def test_building_type_label_known_and_unknown():
    assert building_type_label("maison_unifamiliale") == "Maison unifamiliale"
    assert building_type_label("chalet") == "chalet"
    assert building_type_label(None) == ""
    assert set(BUILDING_TYPE_LABELS) >= {"maison_unifamiliale", "copropriete", "autre"}


def test_mandate_type_label_known_and_unknown():
    assert mandate_type_label("preachat") == "Préachat"
    assert mandate_type_label(None) == ""
    assert set(MANDATE_TYPE_LABELS) == {"preachat", "prevente", "prereception", "expertise", "general"}


def test_checklist_status_label_known_and_unknown():
    assert checklist_status_label("a_surveiller") == "À surveiller"
    assert checklist_status_label("inconnu") == "inconnu"
    assert set(CHECKLIST_STATUS_LABELS) == {
        "conforme",
        "deficient",
        "a_surveiller",
        "non_inspecte",
        "sans_objet",
    }
