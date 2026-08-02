import mimetypes

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Response

from app.db import get_conn
from app.deps import get_current_user
from app.storage import storage

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

    data = storage.read("photos", row["storage_path"])
    if data is None:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    media_type, _ = mimetypes.guess_type(row["storage_path"])
    return Response(content=data, media_type=media_type or "application/octet-stream")
