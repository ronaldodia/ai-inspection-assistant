from app.constants import SECTION_LABELS, section_label


def test_section_label_known_types():
    assert section_label("comble") == "Comble"
    assert section_label("vide_sanitaire") == "Vide sanitaire"
    assert section_label("autre") == "Autre"


def test_section_label_unknown_type_falls_back_to_raw_value():
    assert section_label("sous_sol") == "sous_sol"


def test_section_labels_cover_all_known_section_types():
    assert set(SECTION_LABELS) == {"comble", "vide_sanitaire", "autre"}
