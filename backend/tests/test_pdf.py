import os

from app.pdf import build_report_context, generate_report_pdf


def _photo(section_type, anomalies, overall_condition="bon", storage_path="missing.jpg"):
    return {
        "section_type": section_type,
        "storage_path": storage_path,
        "anomalies": anomalies,
        "overall_condition": overall_condition,
    }


def _anomaly(type_="moisissure", severity="mineure", location="coin", description="d", recommendation="r"):
    return {
        "type": type_,
        "severity": severity,
        "location": location,
        "description": description,
        "recommendation": recommendation,
    }


def test_build_report_context_groups_photos_by_section():
    photos = [
        _photo("comble", [_anomaly()]),
        _photo("comble", [_anomaly()]),
        _photo("vide_sanitaire", [_anomaly()]),
    ]
    context = build_report_context(photos)
    sections = {s["label"]: s for s in context["sections"]}
    assert set(sections) == {"Comble", "Vide sanitaire"}
    assert len(sections["Comble"]["photos"]) == 2
    assert len(sections["Vide sanitaire"]["photos"]) == 1


def test_build_report_context_defaults_missing_section_type_to_autre():
    photos = [{"section_type": None, "storage_path": "x.jpg", "anomalies": [], "overall_condition": "bon"}]
    context = build_report_context(photos)
    labels = [s["label"] for s in context["sections"]]
    assert labels == ["Autre"]


def test_build_report_context_counts_severities_across_all_photos():
    photos = [
        _photo("comble", [_anomaly(severity="critique"), _anomaly(severity="mineure")]),
        _photo("autre", [_anomaly(severity="majeure")]),
    ]
    context = build_report_context(photos)
    assert context["counts"] == {"critique": 1, "majeure": 1, "mineure": 1}
    assert context["findings_count"] == 3


def test_build_report_context_priority_items_excludes_mineure():
    photos = [
        _photo("comble", [
            _anomaly(type_="moisissure", severity="critique"),
            _anomaly(type_="fissure", severity="mineure"),
            _anomaly(type_="infiltration_eau", severity="majeure"),
        ]),
    ]
    context = build_report_context(photos)
    types = {item["type"] for item in context["priority_items"]}
    assert types == {"moisissure", "infiltration_eau"}


def test_build_report_context_priority_items_sorted_critique_before_majeure():
    photos = [
        _photo("comble", [_anomaly(type_="a", severity="majeure")]),
        _photo("autre", [_anomaly(type_="b", severity="critique")]),
    ]
    context = build_report_context(photos)
    severities = [item["severity"] for item in context["priority_items"]]
    assert severities == ["critique", "majeure"]


def test_build_report_context_priority_items_carry_section_label():
    photos = [_photo("vide_sanitaire", [_anomaly(severity="critique")])]
    context = build_report_context(photos)
    assert context["priority_items"][0]["section_label"] == "Vide sanitaire"


def test_build_report_context_rag_status_mapping():
    cases = {
        "bon": "green",
        "acceptable": "amber",
        "mauvais": "red",
        "critique": "red",
    }
    for condition, expected_level in cases.items():
        photos = [_photo("comble", [], overall_condition=condition)]
        context = build_report_context(photos)
        section = next(iter(context["sections"]))
        assert section["photos"][0]["rag"]["level"] == expected_level


def test_build_report_context_rag_status_none_for_unknown_condition():
    photos = [_photo("comble", [], overall_condition="inconnu")]
    context = build_report_context(photos)
    section = next(iter(context["sections"]))
    assert section["photos"][0]["rag"] is None


def test_build_report_context_photo_image_none_when_file_missing():
    photos = [_photo("comble", [], storage_path="does-not-exist.jpg")]
    context = build_report_context(photos)
    section = next(iter(context["sections"]))
    assert section["photos"][0]["image"] is None


def test_generate_report_pdf_writes_a_pdf_file(tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "reports_dir", str(tmp_path))

    inspection = {"id": "test-inspection-id", "address": "123 rue Test", "completed_at": None}
    photos = [_photo("comble", [_anomaly(severity="critique")])]

    filename = generate_report_pdf(
        inspection, photos, "Synthèse de test", "RAP-2026-00001",
        {"full_name": "Test Inspecteur", "certification": None},
    )

    abs_path = os.path.join(str(tmp_path), filename)
    assert os.path.isfile(abs_path)
    assert os.path.getsize(abs_path) > 0
    assert filename.startswith("test-inspection-id-")
    assert filename.endswith(".pdf")
