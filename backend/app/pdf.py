import os
import uuid

from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

from app.config import settings

_env = Environment(
    loader=FileSystemLoader(os.path.join(os.path.dirname(__file__), "templates"))
)

SEVERITY_LABELS = {"mineure": "Mineure", "majeure": "Majeure", "critique": "Critique"}


def generate_report_pdf(inspection: dict, photos: list[dict], synthesis: str) -> str:
    template = _env.get_template("report.html")

    counts = {"critique": 0, "majeure": 0, "mineure": 0}
    findings = []
    for photo in photos:
        for anomaly in photo["anomalies"] or []:
            severity = anomaly.get("severity", "mineure")
            counts[severity] = counts.get(severity, 0) + 1
            findings.append(anomaly)

    html_content = template.render(
        inspection=inspection,
        synthesis=synthesis or "",
        findings=findings,
        counts=counts,
        severity_labels=SEVERITY_LABELS,
    )

    os.makedirs(settings.reports_dir, exist_ok=True)
    filename = f"{inspection['id']}-{uuid.uuid4().hex[:8]}.pdf"
    abs_path = os.path.join(settings.reports_dir, filename)
    HTML(string=html_content).write_pdf(abs_path)
    return filename
