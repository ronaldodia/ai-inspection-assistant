import os
import time
import traceback

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json

from app.claude_client import analyze_photo, synthesize_report
from app.config import settings

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
            SELECT id, address
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
        abs_path = os.path.join(settings.photos_dir, photo["storage_path"])
        ext = photo["storage_path"].rsplit(".", 1)[-1].lower()
        media_type = MEDIA_TYPES.get(ext, "image/jpeg")

        with open(abs_path, "rb") as f:
            image_bytes = f.read()

        section_types.append(photo["section_type"])
        result = analyze_photo(image_bytes, media_type, photo["section_type"])
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


if __name__ == "__main__":
    run()
