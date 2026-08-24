from app.constants import (
    BUILDING_TYPE_LABELS,
    CHECKLIST_STATUS_LABELS,
    FOUNDATION_TYPE_LABELS,
    HEATING_TYPE_LABELS,
    MANDATE_TYPE_LABELS,
    SECTION_LABELS,
    SECURITY_ALERT_VALUE,
    SECURITY_CHECKLIST_ITEMS,
    SECURITY_STATUS_LABELS,
    YES_NO_PARTIAL_LABELS,
    building_type_label,
    checklist_status_label,
    foundation_type_label,
    heating_type_label,
    mandate_type_label,
    section_label,
    security_status_label,
    yes_no_partial_label,
)


def test_section_label_known_types():
    assert section_label("structure") == "Structure"
    assert section_label("securite") == "Sécurité des personnes"
    assert section_label("autre") == "Autre"


def test_section_label_unknown_type_falls_back_to_raw_value():
    assert section_label("sous_sol") == "sous_sol"


def test_section_labels_match_the_11_aibq_disciplines_plus_autre():
    assert set(SECTION_LABELS) == {
        "structure",
        "exterieur",
        "toiture",
        "plomberie",
        "electricite",
        "chauffage",
        "climatisation_ventilation_mecanique",
        "interieur",
        "isolation",
        "ventilation",
        "securite",
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


def test_foundation_type_label_known_and_unknown():
    assert foundation_type_label("beton_coule") == "Béton coulé"
    assert foundation_type_label(None) == ""
    assert set(FOUNDATION_TYPE_LABELS) == {"beton_coule", "blocs_beton", "pierre", "pieux", "dalle"}


def test_heating_type_label_known_and_unknown():
    assert heating_type_label("thermopompe") == "Thermopompe"
    assert heating_type_label(None) == ""
    assert set(HEATING_TYPE_LABELS) == {"electrique", "gaz_naturel", "mazout", "thermopompe", "bienergie"}


def test_yes_no_partial_label():
    assert yes_no_partial_label("partiel") == "Partiel"
    assert yes_no_partial_label(None) == ""
    assert set(YES_NO_PARTIAL_LABELS) == {"oui", "non", "partiel"}


def test_security_status_label_known_and_unknown():
    assert security_status_label("na") == "N/A"
    assert security_status_label("inconnu") == "inconnu"
    assert set(SECURITY_STATUS_LABELS) == {"oui", "non", "na"}


def test_security_checklist_items_have_alert_value_defined_for_each():
    assert set(SECURITY_ALERT_VALUE) == set(SECURITY_CHECKLIST_ITEMS)


def test_security_checklist_odeur_gaz_alerts_on_oui_not_non():
    # Seul item à polarité inversée : la présence (oui) est dangereuse, pas l'absence.
    assert SECURITY_ALERT_VALUE["odeur_gaz"] == "oui"
    other_items = set(SECURITY_CHECKLIST_ITEMS) - {"odeur_gaz"}
    assert all(SECURITY_ALERT_VALUE[item] == "non" for item in other_items)
