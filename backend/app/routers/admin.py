import psycopg
from fastapi import APIRouter, Depends, HTTPException
from psycopg import errors

from app.db import get_conn
from app.deps import require_admin
from app.schemas import (
    CreateInspectorRequest,
    ResetInspectorPasswordRequest,
    UpdateInspectorRequest,
)
from app.security import hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"])

INSPECTOR_FIELDS = """
    id, email, full_name, certification, role, is_active,
    max_inspections, max_photos_per_inspection, must_change_password, created_at
"""


@router.get("/inspectors")
def list_inspectors(admin=Depends(require_admin), conn: psycopg.Connection = Depends(get_conn)):
    return conn.execute(
        f"""
        SELECT u.*,
               (SELECT count(*) FROM inspections i WHERE i.user_id = u.id AND i.archived_at IS NULL) AS inspection_count,
               (SELECT count(*) FROM photos p JOIN inspections i ON i.id = p.inspection_id WHERE i.user_id = u.id) AS photo_count
        FROM (SELECT {INSPECTOR_FIELDS} FROM users) u
        ORDER BY u.created_at DESC
        """
    ).fetchall()


@router.post("/inspectors", status_code=201)
def create_inspector(
    data: CreateInspectorRequest,
    admin=Depends(require_admin),
    conn: psycopg.Connection = Depends(get_conn),
):
    try:
        row = conn.execute(
            f"""
            INSERT INTO users (
                email, password_hash, full_name, certification,
                max_inspections, max_photos_per_inspection, must_change_password
            )
            VALUES (%s, %s, %s, %s, %s, %s, true)
            RETURNING {INSPECTOR_FIELDS}
            """,
            (
                data.email,
                hash_password(data.password),
                data.full_name,
                data.certification,
                data.max_inspections,
                data.max_photos_per_inspection,
            ),
        ).fetchone()
    except errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(status_code=409, detail="Un compte existe déjà avec ce courriel")
    conn.commit()
    return row


@router.patch("/inspectors/{inspector_id}")
def update_inspector(
    inspector_id: str,
    data: UpdateInspectorRequest,
    admin=Depends(require_admin),
    conn: psycopg.Connection = Depends(get_conn),
):
    if inspector_id == str(admin["id"]) and data.is_active is False:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas désactiver votre propre compte")

    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")

    set_clause = ", ".join(f"{field} = %s" for field in updates)
    row = conn.execute(
        f"UPDATE users SET {set_clause} WHERE id = %s RETURNING {INSPECTOR_FIELDS}",
        (*updates.values(), inspector_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Inspecteur introuvable")
    conn.commit()
    return row


@router.post("/inspectors/{inspector_id}/reset-password")
def reset_inspector_password(
    inspector_id: str,
    data: ResetInspectorPasswordRequest,
    admin=Depends(require_admin),
    conn: psycopg.Connection = Depends(get_conn),
):
    result = conn.execute(
        "UPDATE users SET password_hash = %s, must_change_password = true WHERE id = %s",
        (hash_password(data.password), inspector_id),
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Inspecteur introuvable")
    conn.commit()
    return {"ok": True}


@router.get("/stats")
def get_stats(admin=Depends(require_admin), conn: psycopg.Connection = Depends(get_conn)):
    totals = conn.execute(
        """
        SELECT
            (SELECT count(*) FROM users) AS total_inspectors,
            (SELECT count(*) FROM users WHERE is_active) AS active_inspectors,
            (SELECT count(*) FROM inspections WHERE archived_at IS NULL) AS total_inspections,
            (SELECT count(*) FROM photos) AS total_photos,
            (SELECT count(*) FROM inspections WHERE status = 'COMPLETED') AS completed_inspections
        """
    ).fetchone()
    by_status = conn.execute(
        """
        SELECT status, count(*) AS count
        FROM inspections
        WHERE archived_at IS NULL
        GROUP BY status
        """
    ).fetchall()
    top_inspectors = conn.execute(
        """
        SELECT u.id, u.full_name, u.email, count(i.*) AS inspection_count
        FROM users u
        LEFT JOIN inspections i ON i.user_id = u.id AND i.archived_at IS NULL
        GROUP BY u.id, u.full_name, u.email
        ORDER BY inspection_count DESC
        LIMIT 10
        """
    ).fetchall()
    return {
        **totals,
        "by_status": by_status,
        "top_inspectors": top_inspectors,
    }
