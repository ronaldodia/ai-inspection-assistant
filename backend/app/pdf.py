import base64
import io
import os
import uuid

from jinja2 import Environment, FileSystemLoader
from PIL import Image, ImageOps
from weasyprint import HTML

from app.constants import building_type_label, checklist_status_label, mandate_type_label, section_label
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


def _photo_data_uri(storage_path: str) -> str | None:
    data = storage.read("photos", storage_path)
    if data is None:
        return None
    with Image.open(io.BytesIO(data)) as img:
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        if img.width > MAX_IMAGE_WIDTH:
            ratio = MAX_IMAGE_WIDTH / img.width
            img = img.resize((MAX_IMAGE_WIDTH, round(img.height * ratio)))
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
                "image": _photo_data_uri(photo["storage_path"]),
                "anomalies": anomalies,
                "rag": RAG_MAP.get(photo.get("overall_condition")),
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


def generate_report_pdf(
    inspection: dict,
    photos: list[dict],
    checklist: list[dict],
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
        checklist=_build_checklist_context(checklist),
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
