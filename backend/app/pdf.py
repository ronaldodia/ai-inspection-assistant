import base64
import io
import os
import uuid

from jinja2 import Environment, FileSystemLoader
from PIL import Image, ImageOps
from weasyprint import HTML

from app.config import settings
from app.constants import section_label

_env = Environment(
    loader=FileSystemLoader(os.path.join(os.path.dirname(__file__), "templates"))
)

SEVERITY_LABELS = {"mineure": "Mineure", "majeure": "Majeure", "critique": "Critique"}

MAX_IMAGE_WIDTH = 1000


def _photo_data_uri(storage_path: str) -> str | None:
    abs_path = os.path.join(settings.photos_dir, storage_path)
    if not os.path.isfile(abs_path):
        return None
    with Image.open(abs_path) as img:
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        if img.width > MAX_IMAGE_WIDTH:
            ratio = MAX_IMAGE_WIDTH / img.width
            img = img.resize((MAX_IMAGE_WIDTH, round(img.height * ratio)))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
    b64 = base64.standard_b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


def generate_report_pdf(
    inspection: dict, photos: list[dict], synthesis: str, report_number: str, inspector: dict
) -> str:
    template = _env.get_template("report.html")

    counts = {"critique": 0, "majeure": 0, "mineure": 0}
    sections: dict[str, dict] = {}
    for photo in photos:
        anomalies = photo["anomalies"] or []
        for anomaly in anomalies:
            severity = anomaly.get("severity", "mineure")
            counts[severity] = counts.get(severity, 0) + 1

        section_type = photo.get("section_type") or "autre"
        section = sections.setdefault(
            section_type, {"label": section_label(section_type), "photos": []}
        )
        section["photos"].append(
            {
                "image": _photo_data_uri(photo["storage_path"]),
                "anomalies": anomalies,
            }
        )

    findings_count = sum(
        len(p["anomalies"]) for s in sections.values() for p in s["photos"]
    )

    html_content = template.render(
        inspection=inspection,
        synthesis=synthesis or "",
        sections=sections.values(),
        counts=counts,
        findings_count=findings_count,
        severity_labels=SEVERITY_LABELS,
        report_number=report_number,
        inspector=inspector,
    )

    os.makedirs(settings.reports_dir, exist_ok=True)
    filename = f"{inspection['id']}-{uuid.uuid4().hex[:8]}.pdf"
    abs_path = os.path.join(settings.reports_dir, filename)
    HTML(string=html_content).write_pdf(abs_path)
    return filename
