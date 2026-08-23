import base64
import io
import os
import uuid

from jinja2 import Environment, FileSystemLoader
from PIL import Image, ImageDraw, ImageOps
from weasyprint import HTML

from app.constants import (
    SECURITY_ALERT_VALUE,
    building_type_label,
    checklist_status_label,
    foundation_type_label,
    heating_type_label,
    mandate_type_label,
    section_label,
    security_item_label,
    security_status_label,
    yes_no_partial_label,
)
from app.storage import storage

_env = Environment(
    loader=FileSystemLoader(os.path.join(os.path.dirname(__file__), "templates"))
)

SEVERITY_LABELS = {
    "securite": "Sécurité",
    "majeur": "Majeur",
    "mineur": "Mineur",
    "entretien": "Entretien",
    "observation": "Observation",
}

RAG_MAP = {
    "bon": {"level": "green", "label": "Adéquat"},
    "acceptable": {"level": "amber", "label": "Avertissement"},
    "mauvais": {"level": "red", "label": "Prioritaire"},
    "critique": {"level": "red", "label": "Prioritaire"},
}

CHECKLIST_STATUS_COLOR = {
    "conforme": "green",
    "a_surveiller": "amber",
    "deficient": "red",
    "sans_objet": "gray",
    "non_inspecte": "gray",
}

DISCLOSURE_TYPE_LABELS = {
    "vice_connu": "Vice connu",
    "renovation": "Rénovation",
    "systeme_present": "Système présent",
    "garantie": "Garantie",
    "observation": "Observation",
}

MAX_IMAGE_WIDTH = 1000

# Repères posés par l'inspecteur en révision (anomaly["marker"] = {x, y} en
# fraction 0-1 de la largeur/hauteur) — mêmes teintes que .sev-* dans
# templates/report.html pour rester visuellement cohérent avec le reste du
# rapport.
SEVERITY_MARKER_COLOR = {
    "securite": (127, 29, 29),
    "majeur": (194, 65, 12),
    "mineur": (161, 98, 7),
    "entretien": (71, 85, 105),
    "observation": (120, 113, 108),
}


def _draw_markers(img: Image.Image, anomalies: list[dict]) -> None:
    draw = ImageDraw.Draw(img)
    radius = max(14, round(img.width * 0.018))
    for i, anomaly in enumerate(anomalies, start=1):
        marker = anomaly.get("marker")
        if not marker:
            continue
        cx = marker["x"] * img.width
        cy = marker["y"] * img.height
        color = SEVERITY_MARKER_COLOR.get(anomaly.get("severity"), SEVERITY_MARKER_COLOR["observation"])
        draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=(255, 255, 255), outline=color, width=3)
        draw.text((cx, cy), str(i), fill=color, anchor="mm")


def _photo_data_uri(storage_path: str, anomalies: list[dict] | None = None) -> str | None:
    data = storage.read("photos", storage_path)
    if data is None:
        return None
    with Image.open(io.BytesIO(data)) as img:
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        if img.width > MAX_IMAGE_WIDTH:
            ratio = MAX_IMAGE_WIDTH / img.width
            img = img.resize((MAX_IMAGE_WIDTH, round(img.height * ratio)))
        if anomalies:
            _draw_markers(img, anomalies)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
    b64 = base64.standard_b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


def build_report_context(photos: list[dict]) -> dict:
    """Pure aggregation of photos/anomalies into the shape the PDF template needs.

    No file or network I/O — kept separate from generate_report_pdf so the
    grouping/counting/priority-sorting logic can be unit-tested without WeasyPrint.
    """
    counts = {"securite": 0, "majeur": 0, "mineur": 0, "entretien": 0, "observation": 0}
    sections: dict[str, dict] = {}
    for photo in photos:
        anomalies = photo["anomalies"] or []
        for anomaly in anomalies:
            severity = anomaly.get("severity", "mineur")
            counts[severity] = counts.get(severity, 0) + 1

        section_type = photo.get("section_type") or "autre"
        section = sections.setdefault(
            section_type, {"label": section_label(section_type), "photos": []}
        )
        section["photos"].append(
            {
                "image": _photo_data_uri(photo["storage_path"], anomalies),
                "anomalies": anomalies,
                "rag": RAG_MAP.get(photo.get("overall_condition")),
                "location_detail": photo.get("location_detail"),
            }
        )

    findings_count = sum(
        len(p["anomalies"]) for s in sections.values() for p in s["photos"]
    )

    priority_items = [
        {**anomaly, "section_label": section["label"]}
        for section in sections.values()
        for photo in section["photos"]
        for anomaly in photo["anomalies"]
        if anomaly.get("severity") in ("securite", "majeur")
    ]
    priority_items.sort(key=lambda a: a["severity"] != "securite")

    return {
        "sections": sections.values(),
        "counts": counts,
        "findings_count": findings_count,
        "priority_items": priority_items,
    }


def _build_checklist_context(checklist: list[dict]) -> list[dict]:
    return [
        {
            "system_label": section_label(item["system_type"]),
            "status": item["status"],
            "status_label": checklist_status_label(item["status"]),
            "color": CHECKLIST_STATUS_COLOR.get(item["status"], "gray"),
            "notes": item.get("notes"),
        }
        for item in checklist
    ]


def _build_disclosure_context(disclosure_items: list[dict]) -> list[dict]:
    return [
        {
            "category_label": section_label(item["category"]),
            "type_label": DISCLOSURE_TYPE_LABELS.get(item["type"], item["type"]),
            "description": item["description"],
            "year": item.get("year"),
        }
        for item in disclosure_items
    ]


def _build_security_checklist_context(security_checklist: list[dict]) -> list[dict]:
    return [
        {
            "label": security_item_label(item["item_key"]),
            "status": item["status"],
            "status_label": security_status_label(item["status"]),
            "alert": item["status"] == SECURITY_ALERT_VALUE.get(item["item_key"]),
            "notes": item.get("notes"),
        }
        for item in security_checklist
    ]


def generate_report_pdf(
    inspection: dict,
    photos: list[dict],
    checklist: list[dict],
    security_checklist: list[dict],
    synthesis: str,
    report_number: str,
    inspector: dict,
) -> str:
    template = _env.get_template("report.html")
    context = build_report_context(photos)

    html_content = template.render(
        inspection=inspection,
        building_type_display=building_type_label(inspection.get("building_type")),
        mandate_type_display=mandate_type_label(inspection.get("inspection_type")),
        foundation_type_display=foundation_type_label(inspection.get("foundation_type")),
        heating_type_display=heating_type_label(inspection.get("heating_type")),
        has_basement_display=yes_no_partial_label(inspection.get("has_basement")),
        has_crawlspace_display=yes_no_partial_label(inspection.get("has_crawlspace")),
        has_attic_display=yes_no_partial_label(inspection.get("has_attic")),
        checklist=_build_checklist_context(checklist),
        security_checklist=_build_security_checklist_context(security_checklist),
        disclosure_items=_build_disclosure_context(inspection.get("disclosure_items") or []),
        synthesis=synthesis or "",
        severity_labels=SEVERITY_LABELS,
        report_number=report_number,
        inspector=inspector,
        **context,
    )

    filename = f"{inspection['id']}-{uuid.uuid4().hex[:8]}.pdf"
    pdf_bytes = HTML(string=html_content).write_pdf()
    storage.write("reports", filename, pdf_bytes)
    return filename
