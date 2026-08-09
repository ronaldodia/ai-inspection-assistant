import psycopg
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db import get_conn
from app.security import decode_access_token

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    conn: psycopg.Connection = Depends(get_conn),
):
    try:
        user_id = decode_access_token(credentials.credentials)
    except ValueError:
        raise HTTPException(status_code=401, detail="Token invalide")

    row = conn.execute(
        """
        SELECT id, email, full_name, certification, role, is_active,
               max_inspections, max_photos_per_inspection
        FROM users WHERE id = %s
        """,
        (user_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")
    if not row["is_active"]:
        raise HTTPException(status_code=403, detail="Compte désactivé")
    return row


def require_admin(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    return user


def get_owned_inspection(conn: psycopg.Connection, inspection_id: str, user_id):
    row = conn.execute(
        "SELECT * FROM inspections WHERE id = %s AND user_id = %s AND archived_at IS NULL",
        (inspection_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Inspection introuvable")
    return row
