import psycopg
from fastapi import APIRouter, Depends, HTTPException

from app.db import get_conn
from app.schemas import LoginRequest, TokenResponse
from app.security import create_access_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, conn: psycopg.Connection = Depends(get_conn)):
    row = conn.execute(
        "SELECT id, password_hash FROM users WHERE email = %s", (data.email,)
    ).fetchone()
    if not row or not verify_password(data.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Identifiants invalides")
    token = create_access_token(str(row["id"]))
    return TokenResponse(access_token=token, token_type="bearer")
