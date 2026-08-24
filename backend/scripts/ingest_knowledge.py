import argparse
import re
from pathlib import Path

from psycopg import errors
from pypdf import PdfReader

from app.knowledge import embed_documents, open_connection

ARTICLE_PATTERN = re.compile(r"(?m)^(\d{1,2}\.\d{1,2}\.\d{1,2}\.\d{1,2}\.?)\s")
MD_SECTION_PATTERN = re.compile(r"(?m)^## (.+)$")
CHUNK_SIZE = 1600  # ~ 400 tokens
CHUNK_OVERLAP = 200


def _extract_pages(pdf_path: str) -> list[tuple[int, str]]:
    reader = PdfReader(pdf_path)
    return [(i + 1, page.extract_text() or "") for i, page in enumerate(reader.pages)]


def _window_chunks(text: str, reference: str) -> list[tuple[str, str]]:
    text = text.strip()
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE
        chunks.append((text[start:end].strip(), reference))
        start = end - CHUNK_OVERLAP
    return [(c, r) for c, r in chunks if c]


def _chunk_by_article(pages: list[tuple[int, str]]) -> list[tuple[str, str]]:
    full_text = "\n".join(text for _, text in pages)
    matches = list(ARTICLE_PATTERN.finditer(full_text))
    if not matches:
        return []

    chunks = []
    for i, match in enumerate(matches):
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(full_text)
        article_number = match.group(1)
        body = full_text[start:end].strip()
        if len(body) <= CHUNK_SIZE:
            chunks.append((body, f"Article {article_number}"))
        else:
            chunks.extend(_window_chunks(body, f"Article {article_number}"))
    return chunks


def chunk_document(pages: list[tuple[int, str]], source: str) -> list[tuple[str, str]]:
    if source == "code_batiment_qc":
        chunks = _chunk_by_article(pages)
        if chunks:
            return chunks
    chunks = []
    for page_num, text in pages:
        chunks.extend(_window_chunks(text, f"p. {page_num}"))
    return chunks


def chunk_markdown(text: str) -> list[tuple[str, str]]:
    """Découpe un document Markdown sur ses titres de niveau 2 (## ...) — une
    entrée par section, avec repli sur _window_chunks si une section dépasse
    la taille cible. Même structure que _chunk_by_article, adaptée aux titres
    Markdown plutôt qu'aux numéros d'article d'un code du bâtiment."""
    matches = list(MD_SECTION_PATTERN.finditer(text))
    if not matches:
        return _window_chunks(text.strip(), "")

    chunks = []
    for i, match in enumerate(matches):
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        heading = match.group(1).strip()
        body = text[start:end].strip()
        if len(body) <= CHUNK_SIZE:
            chunks.append((body, heading))
        else:
            chunks.extend(_window_chunks(body, heading))
    return chunks


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingère un document PDF ou Markdown (Code de construction du Québec, "
        "norme AIBQ, référence des 11 sections, etc.) dans la base de connaissances du RAG."
    )
    parser.add_argument("document_path")
    parser.add_argument("--title", required=True)
    parser.add_argument(
        "--source",
        required=True,
        choices=["code_batiment_qc", "aibq_norme_pratique", "aibq_11_sections"],
    )
    parser.add_argument("--source-url", default=None)
    parser.add_argument(
        "--license-note",
        required=True,
        help="Confirmation des droits de réutilisation (ex: 'usage confirmé par courriel avec la RBQ le 2026-08-16') — obligatoire, ce document ne doit pas être ingéré sans avoir vérifié ce point.",
    )
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args()

    if args.document_path.lower().endswith(".md"):
        text = Path(args.document_path).read_text(encoding="utf-8")
        chunks = chunk_markdown(text)
    else:
        pages = _extract_pages(args.document_path)
        chunks = chunk_document(pages, args.source)

    if not chunks:
        print("Aucun texte extractible de ce document — abandon.")
        return

    print(f"{len(chunks)} extraits identifiés, calcul des embeddings...")
    contents = [c for c, _ in chunks]
    embeddings = embed_documents(contents)

    with open_connection() as conn:
        try:
            with conn.cursor() as cur:
                if args.replace:
                    cur.execute("DELETE FROM knowledge_documents WHERE title = %s", (args.title,))
                cur.execute(
                    """
                    INSERT INTO knowledge_documents (title, source, source_url, license_note)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id
                    """,
                    (args.title, args.source, args.source_url, args.license_note),
                )
                document_id = cur.fetchone()["id"]
                for (content, reference), embedding in zip(chunks, embeddings):
                    cur.execute(
                        """
                        INSERT INTO knowledge_chunks (document_id, content, reference, embedding)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (document_id, content, reference, embedding),
                    )
        except errors.UniqueViolation:
            conn.rollback()
            print(f"Un document intitulé « {args.title} » existe déjà — relancer avec --replace pour le remplacer.")
            return
        conn.commit()

    print(f"{len(chunks)} extraits ingérés pour « {args.title} ».")
    print(
        "Le pod worker garde le contexte par section en cache jusqu'à 1h "
        "(app.knowledge.CACHE_TTL_SECONDS) — ce nouveau contenu sera pris en compte "
        "automatiquement dans ce délai, sans redémarrage."
    )


if __name__ == "__main__":
    main()
