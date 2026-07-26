import os

import psycopg
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.config import settings
from app.db import get_conn
from app.deps import get_current_user

router = APIRouter(prefix="/api/photos", tags=["photos"])


@router.get("/{photo_id}")
def get_photo(
    photo_id: str,
    user=Depends(get_current_user),
    conn: psycopg.Connection = Depends(get_conn),
):
    row = conn.execute(
        """
        SELECT p.storage_path
        FROM photos p
        JOIN inspections i ON i.id = p.inspection_id
        WHERE p.id = %s AND i.user_id = %s
        """,
        (photo_id, user["id"]),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Photo introuvable")

    abs_path = os.path.join(settings.photos_dir, row["storage_path"])
    if not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    return FileResponse(abs_path)
