import time
from pathlib import Path

import psycopg

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"

# Clé arbitraire pour le verrou consultatif Postgres — évite que deux pods
# (backend + réplicas) appliquent les migrations en même temps au démarrage.
ADVISORY_LOCK_KEY = 8743219

# Au tout premier démarrage d'un conteneur (ex. Azure App Service), le
# résolveur DNS interne n'est parfois pas encore prêt pour les toutes
# premières connexions sortantes — sans retry ici, ça fait planter le
# démarrage de l'appli entière plutôt qu'une erreur transitoire silencieuse.
CONNECT_RETRIES = 5
CONNECT_RETRY_DELAY_SECONDS = 3


def _connect_with_retry(database_url: str) -> psycopg.Connection:
    last_error: Exception | None = None
    for attempt in range(1, CONNECT_RETRIES + 1):
        try:
            return psycopg.connect(database_url, autocommit=False)
        except psycopg.OperationalError as exc:
            last_error = exc
            if attempt < CONNECT_RETRIES:
                time.sleep(CONNECT_RETRY_DELAY_SECONDS)
    raise last_error


def run_migrations(database_url: str) -> None:
    with _connect_with_retry(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_lock(%s)", (ADVISORY_LOCK_KEY,))
        conn.commit()
        try:
            _apply_pending(conn)
        finally:
            with conn.cursor() as cur:
                cur.execute("SELECT pg_advisory_unlock(%s)", (ADVISORY_LOCK_KEY,))
            conn.commit()


def _apply_pending(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        cur.execute("SELECT filename FROM schema_migrations")
        applied = {row[0] for row in cur.fetchall()}
    conn.commit()

    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        if path.name in applied:
            continue
        with conn.cursor() as cur:
            cur.execute(path.read_text(encoding="utf-8"))
            cur.execute("INSERT INTO schema_migrations (filename) VALUES (%s)", (path.name,))
        conn.commit()
