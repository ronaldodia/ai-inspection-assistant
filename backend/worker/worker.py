import os
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json

from app.claude_client import analyze_photo, synthesize_report
from app.config import settings
from app.storage import storage

POLL_INTERVAL_SECONDS = 3
MEDIA_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
}


def get_connection() -> psycopg.Connection:
    return psycopg.connect(settings.database_url, row_factory=dict_row, autocommit=False)


def claim_next_inspection(conn: psycopg.Connection) -> dict | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, address, building_type, year_built
            FROM inspections
            WHERE status = 'QUEUED'
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
            """
        )
        row = cur.fetchone()
        if row is None:
            conn.rollback()
            return None
        cur.execute("UPDATE inspections SET status = 'PROCESSING' WHERE id = %s", (row["id"],))
    conn.commit()
    return row


def process_inspection(conn: psycopg.Connection, inspection: dict) -> None:
    inspection_id = inspection["id"]

    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, storage_path, section_type FROM photos WHERE inspection_id = %s ORDER BY photo_order",
            (inspection_id,),
        )
        photos = cur.fetchall()

    if not photos:
        raise RuntimeError("Aucune photo à analyser")

    all_anomalies: list[dict] = []
    section_types: list[str] = []

    for photo in photos:
        ext = photo["storage_path"].rsplit(".", 1)[-1].lower()
        media_type = MEDIA_TYPES.get(ext, "image/jpeg")

        image_bytes = storage.read("photos", photo["storage_path"])
        if image_bytes is None:
            raise RuntimeError(f"Photo introuvable dans le stockage: {photo['storage_path']}")

        section_types.append(photo["section_type"])
        result = analyze_photo(
            image_bytes,
            media_type,
            photo["section_type"],
            inspection.get("building_type"),
            inspection.get("year_built"),
        )
        usage = result.pop("_usage")
        all_anomalies.extend(result["anomalies"])

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO anomaly_detections
                    (photo_id, anomalies, overall_condition, input_tokens, output_tokens, model)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (photo_id) DO UPDATE SET
                    anomalies = EXCLUDED.anomalies,
                    overall_condition = EXCLUDED.overall_condition,
                    input_tokens = EXCLUDED.input_tokens,
                    output_tokens = EXCLUDED.output_tokens,
                    model = EXCLUDED.model,
                    detected_at = now()
                """,
                (
                    photo["id"],
                    Json(result["anomalies"]),
                    result["overall_condition"],
                    usage["input_tokens"],
                    usage["output_tokens"],
                    usage["model"],
                ),
            )
        conn.commit()

    synthesis = synthesize_report(inspection["address"], section_types, all_anomalies)

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO reports (inspection_id, synthesis)
            VALUES (%s, %s)
            ON CONFLICT (inspection_id) DO UPDATE SET synthesis = EXCLUDED.synthesis
            """,
            (inspection_id, synthesis),
        )
        cur.execute("UPDATE inspections SET status = 'REVIEW' WHERE id = %s", (inspection_id,))
    conn.commit()


def run() -> None:
    print("Worker Inspect IA démarré, en attente d'inspections en file d'attente...", flush=True)
    while True:
        conn = get_connection()
        try:
            inspection = claim_next_inspection(conn)
            if inspection is None:
                conn.close()
                time.sleep(POLL_INTERVAL_SECONDS)
                continue

            print(f"Traitement de l'inspection {inspection['id']}...", flush=True)
            try:
                process_inspection(conn, inspection)
                print(f"Inspection {inspection['id']} -> REVIEW", flush=True)
            except Exception as exc:  # noqa: BLE001 - isolation par inspection, ne pas tuer le worker
                conn.rollback()
                error_message = f"{exc}\n{traceback.format_exc()}"[:4000]
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE inspections SET status = 'ERROR', error_message = %s WHERE id = %s",
                        (error_message, inspection["id"]),
                    )
                conn.commit()
                print(f"Erreur sur l'inspection {inspection['id']}: {exc}", flush=True)
        finally:
            conn.close()


class _HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        self.send_response(200)
        self.end_headers()

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - imposé par BaseHTTPRequestHandler
        pass


def _start_health_server() -> None:
    # Le worker n'a pas de serveur HTTP par nature (il ne fait que poller
    # Postgres) — mais Azure App Service tue le conteneur si rien n'écoute
    # sur le port attendu (voir EXPOSE 8000 dans le Dockerfile). Ce serveur
    # ne fait qu'exister pour satisfaire cette sonde de démarrage/liveness ;
    # il n'a aucun rôle fonctionnel.
    port = int(os.environ.get("PORT", 8000))
    HTTPServer(("0.0.0.0", port), _HealthHandler).serve_forever()


if __name__ == "__main__":
    threading.Thread(target=_start_health_server, daemon=True).start()
    run()
