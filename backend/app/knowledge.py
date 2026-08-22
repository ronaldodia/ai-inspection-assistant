import time

import psycopg
import voyageai
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row

from app.config import settings
from app.constants import section_label

EMBEDDING_MODEL = "voyage-4"
TOP_K = 4

# analyze_photo() (donc ce module) tourne dans le process worker
# (backend/worker/worker.py), un pod distinct du backend API — un cache "vidable"
# via un endpoint HTTP du backend n'aurait aucun effet sur ce process. Une simple
# expiration temporelle évite d'avoir à coordonner l'invalidation entre les deux :
# une nouvelle ingestion est prise en compte dans l'heure qui suit, sans
# redémarrage manuel du pod worker.
CACHE_TTL_SECONDS = 3600

_voyage = voyageai.Client(api_key=settings.voyage_api_key)

# section_type -> (contexte, expiration). SECTION_LABELS ne compte qu'une
# poignée de valeurs (voir app.constants) — le coût de recherche vectorielle
# reste négligeable même renouvelé toutes les heures.
_cache: dict[str, tuple[str, float]] = {}


def open_connection() -> psycopg.Connection:
    conn = psycopg.connect(settings.database_url, row_factory=dict_row)
    register_vector(conn)
    return conn


def embed_documents(texts: list[str]) -> list[list[float]]:
    result = _voyage.embed(texts, model=EMBEDDING_MODEL, input_type="document")
    return result.embeddings


def embed_query(text: str) -> list[float]:
    result = _voyage.embed([text], model=EMBEDDING_MODEL, input_type="query")
    return result.embeddings[0]


def get_context_for_section(section_type: str, k: int = TOP_K) -> str:
    cached = _cache.get(section_type)
    if cached is not None and cached[1] > time.monotonic():
        return cached[0]

    try:
        context = _fetch_context(section_type, k)
    except Exception as exc:  # noqa: BLE001 - une panne Voyage/Postgres ne doit
        # pas casser l'analyse photo elle-même, qui fonctionnait déjà sans RAG.
        # Le résultat vide est mis en cache comme un succès (même TTL) pour éviter
        # de retenter cet appel réseau à chaque photo tant que le service est down.
        print(f"knowledge.get_context_for_section({section_type!r}) a échoué, contexte ignoré : {exc}", flush=True)
        context = ""

    _cache[section_type] = (context, time.monotonic() + CACHE_TTL_SECONDS)
    return context


def _fetch_context(section_type: str, k: int) -> str:
    query = (
        "Défauts, risques et exigences réglementaires typiques pour l'inspection "
        f"de : {section_label(section_type)}"
    )
    query_embedding = embed_query(query)

    with open_connection() as conn:
        rows = conn.execute(
            """
            SELECT content, reference
            FROM knowledge_chunks
            ORDER BY embedding <=> %s
            LIMIT %s
            """,
            (query_embedding, k),
        ).fetchall()

    if not rows:
        return ""

    lines = []
    for row in rows:
        ref = f" ({row['reference']})" if row["reference"] else ""
        lines.append(f"- {row['content']}{ref}")
    return "\n".join(lines)
