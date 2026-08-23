import os

from app.pdf import build_report_context, generate_report_pdf


def _photo(section_type, anomalies, overall_condition="bon", storage_path="missing.jpg"):
    return {
        "section_type": section_type,
        "storage_path": storage_path,
        "anomalies": anomalies,
        "overall_condition": overall_condition,
    }


def _anomaly(type_="moisissure", severity="mineur", location="coin", description="d", recommendation="r"):
    return {
        "type": type_,
        "severity": severity,
        "location": location,
        "description": description,
        "recommendation": recommendation,
    }


def test_build_report_context_groups_photos_by_section():
    photos = [
        _photo("structure", [_anomaly()]),
        _photo("structure", [_anomaly()]),
        _photo("isolation", [_anomaly()]),
    ]
    context = build_report_context(photos)
    sections = {s["label"]: s for s in context["sections"]}
    assert set(sections) == {"Structure", "Isolation"}
    assert len(sections["Structure"]["photos"]) == 2
    assert len(sections["Isolation"]["photos"]) == 1


def test_build_report_context_defaults_missing_section_type_to_autre():
    photos = [{"section_type": None, "storage_path": "x.jpg", "anomalies": [], "overall_condition": "bon"}]
    context = build_report_context(photos)
    labels = [s["label"] for s in context["sections"]]
    assert labels == ["Autre"]


def test_build_report_context_counts_severities_across_all_photos():
    photos = [
        _photo("structure", [_anomaly(severity="securite"), _anomaly(severity="mineur")]),
        _photo("autre", [_anomaly(severity="majeur")]),
    ]
    context = build_report_context(photos)
    assert context["counts"] == {"securite": 1, "majeur": 1, "mineur": 1, "entretien": 0, "observation": 0}
    assert context["findings_count"] == 3


def test_build_report_context_priority_items_excludes_mineur():
    photos = [
        _photo("structure", [
            _anomaly(type_="moisissure", severity="securite"),
            _anomaly(type_="fissure", severity="mineur"),
            _anomaly(type_="infiltration_eau", severity="majeur"),
        ]),
    ]
    context = build_report_context(photos)
    types = {item["type"] for item in context["priority_items"]}
    assert types == {"moisissure", "infiltration_eau"}


def test_build_report_context_priority_items_sorted_securite_before_majeur():
    photos = [
        _photo("structure", [_anomaly(type_="a", severity="majeur")]),
        _photo("autre", [_anomaly(type_="b", severity="securite")]),
    ]
    context = build_report_context(photos)
    severities = [item["severity"] for item in context["priority_items"]]
    assert severities == ["securite", "majeur"]


def test_build_report_context_priority_items_carry_section_label():
    photos = [_photo("isolation", [_anomaly(severity="securite")])]
    context = build_report_context(photos)
    assert context["priority_items"][0]["section_label"] == "Isolation"


def test_build_report_context_rag_status_mapping():
    cases = {
        "bon": "green",
        "acceptable": "amber",
        "mauvais": "red",
        "critique": "red",
    }
    for condition, expected_level in cases.items():
        photos = [_photo("structure", [], overall_condition=condition)]
        context = build_report_context(photos)
        section = next(iter(context["sections"]))
        assert section["photos"][0]["rag"]["level"] == expected_level


def test_build_report_context_rag_status_none_for_unknown_condition():
    photos = [_photo("structure", [], overall_condition="inconnu")]
    context = build_report_context(photos)
    section = next(iter(context["sections"]))
    assert section["photos"][0]["rag"] is None


def test_build_report_context_photo_image_none_when_file_missing():
    photos = [_photo("structure", [], storage_path="does-not-exist.jpg")]
    context = build_report_context(photos)
    section = next(iter(context["sections"]))
    assert section["photos"][0]["image"] is None


def test_generate_report_pdf_writes_a_pdf_file(tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "reports_dir", str(tmp_path))

    inspection = {
        "id": "test-inspection-id",
        "address": "123 rue Test",
        "completed_at": None,
        "inspection_type": "preachat",
        "building_type": "maison_unifamiliale",
        "year_built": 1985,
        "client_name": "Client Test",
        "weather_conditions": "Ensoleillé",
        "temperature_celsius": 12,
        "humidity_percent": 55,
    }
    photos = [_photo("structure", [_anomaly(severity="securite")])]
    checklist = [{"system_type": "structure", "status": "deficient", "notes": None}]
    security_checklist = [{"item_key": "odeur_gaz", "status": "non", "notes": None}]

    filename = generate_report_pdf(
        inspection, photos, checklist, security_checklist, "Synthèse de test", "RAP-2026-00001",
        {"full_name": "Test Inspecteur", "certification": None},
    )

    abs_path = os.path.join(str(tmp_path), filename)
    assert os.path.isfile(abs_path)
    assert os.path.getsize(abs_path) > 0
    assert filename.startswith("test-inspection-id-")
    assert filename.endswith(".pdf")
