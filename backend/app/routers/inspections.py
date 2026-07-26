import os
import uuid

import psycopg
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from psycopg.types.json import Json

from app.config import settings
from app.db import get_conn
from app.deps import get_current_user, get_owned_inspection
from app.pdf import generate_report_pdf
from app.schemas import CreateInspectionRequest, UpdateAnomaliesRequest, UpdateSynthesisRequest

router = APIRouter(prefix="/api/inspections", tags=["inspections"])

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
MAX_PHOTO_BYTES = 10 * 1024 * 1024


@router.post("", status_code=201)
def create_inspection(
    data: CreateInspectionRequest,
    user=Depends(get_current_user),
    conn: psycopg.Connection = Depends(get_conn),
):
    row = conn.execute(
        """
        INSERT INTO inspections (user_id, address, inspection_type, notes, lat, lon)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id, status, address, inspection_type, notes, lat, lon, created_at
        """,
        (user["id"], data.address, data.inspection_type, data.notes, data.lat, data.lon),
    ).fetchone()
    conn.commit()
    return row


@router.get("")
def list_inspections(
    user=Depends(get_current_user),
    conn: psycopg.Connection = Depends(get_conn),
):
    return conn.execute(
        """
        SELECT id, address, inspection_type, status, created_at, completed_at
        FROM inspections
        WHERE user_id = %s AND archived_at IS NULL
        ORDER BY created_at DESC
        """,
        (user["id"],),
    ).fetchall()


@router.get("/{inspection_id}")
def get_inspection(
    inspection_id: str,
    user=Depends(get_current_user),
    conn: psycopg.Connection = Depends(get_conn),
):
    inspection = get_owned_inspection(conn, inspection_id, user["id"])
    photos = conn.execute(
        """
        SELECT p.id, p.photo_order, p.lat, p.lon, p.taken_at,
               a.anomalies, a.overall_condition, a.reviewed
        FROM photos p
        LEFT JOIN anomaly_detections a ON a.photo_id = p.id
        WHERE p.inspection_id = %s
        ORDER BY p.photo_order
        """,
        (inspection_id,),
    ).fetchall()
    report = conn.execute(
        "SELECT synthesis, pdf_path, generated_at FROM reports WHERE inspection_id = %s",
        (inspection_id,),
    ).fetchone()
    return {"inspection": inspection, "photos": photos, "report": report}


@router.post("/{inspection_id}/photos")
def upload_photo(
    inspection_id: str,
    file: UploadFile = File(...),
    client_photo_id: str = Form(...),
    photo_order: int = Form(...),
    lat: float | None = Form(None),
    lon: float | None = Form(None),
    taken_at: str | None = Form(None),
    user=Depends(get_current_user),
    conn: psycopg.Connection = Depends(get_conn),
):
    inspection = get_owned_inspection(conn, inspection_id, user["id"])
    if inspection["status"] not in ("DRAFT", "ERROR"):
        raise HTTPException(status_code=400, detail="Impossible d'ajouter une photo à cette étape")

    existing = conn.execute(
        "SELECT id FROM photos WHERE inspection_id = %s AND client_photo_id = %s",
        (inspection_id, client_photo_id),
    ).fetchone()
    if existing:
        return {"id": str(existing["id"]), "duplicate": True}

    ext = ALLOWED_CONTENT_TYPES.get(file.content_type)
    if ext is None:
        raise HTTPException(status_code=400, detail="Format de fichier non supporté")

    contents = file.file.read()
    if len(contents) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 10 Mo)")

    photo_id = str(uuid.uuid4())
    rel_path = f"{inspection_id}/{photo_id}.{ext}"
    abs_path = os.path.join(settings.photos_dir, rel_path)
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    with open(abs_path, "wb") as f:
        f.write(contents)

    row = conn.execute(
        """
        INSERT INTO photos (id, inspection_id, client_photo_id, storage_path, photo_order, lat, lon, taken_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (photo_id, inspection_id, client_photo_id, rel_path, photo_order, lat, lon, taken_at),
    ).fetchone()
    conn.commit()
    return {"id": str(row["id"]), "duplicate": False}


@router.post("/{inspection_id}/queue")
def queue_inspection(
    inspection_id: str,
    user=Depends(get_current_user),
    conn: psycopg.Connection = Depends(get_conn),
):
    inspection = get_owned_inspection(conn, inspection_id, user["id"])
    if inspection["status"] not in ("DRAFT", "ERROR"):
        raise HTTPException(status_code=400, detail="Cette inspection ne peut pas être mise en file d'attente")

    count = conn.execute(
        "SELECT count(*) AS c FROM photos WHERE inspection_id = %s", (inspection_id,)
    ).fetchone()
    if count["c"] == 0:
        raise HTTPException(status_code=400, detail="Aucune photo à analyser")

    conn.execute(
        "UPDATE inspections SET status = 'QUEUED', error_message = NULL WHERE id = %s",
        (inspection_id,),
    )
    conn.commit()
    return {"status": "QUEUED"}


@router.patch("/{inspection_id}/photos/{photo_id}/anomalies")
def update_photo_anomalies(
    inspection_id: str,
    photo_id: str,
    data: UpdateAnomaliesRequest,
    user=Depends(get_current_user),
    conn: psycopg.Connection = Depends(get_conn),
):
    inspection = get_owned_inspection(conn, inspection_id, user["id"])
    if inspection["status"] != "REVIEW":
        raise HTTPException(status_code=400, detail="L'inspection n'est pas en révision")

    anomalies_json = [a.model_dump() for a in data.anomalies]
    result = conn.execute(
        """
        UPDATE anomaly_detections
        SET anomalies = %s, overall_condition = %s, reviewed = true
        WHERE photo_id = %s
        """,
        (Json(anomalies_json), data.overall_condition, photo_id),
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Photo introuvable pour cette inspection")
    conn.commit()
    return {"ok": True}


@router.patch("/{inspection_id}/synthesis")
def update_synthesis(
    inspection_id: str,
    data: UpdateSynthesisRequest,
    user=Depends(get_current_user),
    conn: psycopg.Connection = Depends(get_conn),
):
    inspection = get_owned_inspection(conn, inspection_id, user["id"])
    if inspection["status"] != "REVIEW":
        raise HTTPException(status_code=400, detail="L'inspection n'est pas en révision")

    conn.execute(
        "UPDATE reports SET synthesis = %s WHERE inspection_id = %s",
        (data.synthesis, inspection_id),
    )
    conn.commit()
    return {"ok": True}


@router.post("/{inspection_id}/finalize")
def finalize_inspection(
    inspection_id: str,
    user=Depends(get_current_user),
    conn: psycopg.Connection = Depends(get_conn),
):
    inspection = get_owned_inspection(conn, inspection_id, user["id"])
    if inspection["status"] != "REVIEW":
        raise HTTPException(status_code=400, detail="L'inspection n'est pas prête à être finalisée")

    photos = conn.execute(
        """
        SELECT p.id, p.photo_order, a.anomalies
        FROM photos p
        JOIN anomaly_detections a ON a.photo_id = p.id
        WHERE p.inspection_id = %s
        ORDER BY p.photo_order
        """,
        (inspection_id,),
    ).fetchall()
    report = conn.execute(
        "SELECT synthesis FROM reports WHERE inspection_id = %s", (inspection_id,)
    ).fetchone()

    pdf_filename = generate_report_pdf(
        dict(inspection), photos, report["synthesis"] if report else ""
    )

    conn.execute(
        "UPDATE reports SET pdf_path = %s, generated_at = now() WHERE inspection_id = %s",
        (pdf_filename, inspection_id),
    )
    conn.execute(
        "UPDATE inspections SET status = 'COMPLETED', completed_at = now() WHERE id = %s",
        (inspection_id,),
    )
    conn.commit()
    return {"status": "COMPLETED"}


@router.get("/{inspection_id}/report.pdf")
def download_report(
    inspection_id: str,
    user=Depends(get_current_user),
    conn: psycopg.Connection = Depends(get_conn),
):
    get_owned_inspection(conn, inspection_id, user["id"])
    report = conn.execute(
        "SELECT pdf_path FROM reports WHERE inspection_id = %s", (inspection_id,)
    ).fetchone()
    if not report or not report["pdf_path"]:
        raise HTTPException(status_code=404, detail="Rapport non disponible")

    abs_path = os.path.join(settings.reports_dir, report["pdf_path"])
    if not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    return FileResponse(abs_path, media_type="application/pdf", filename=f"rapport-{inspection_id}.pdf")
