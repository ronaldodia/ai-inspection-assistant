import base64
import json

import anthropic

from app.config import settings
from app.constants import section_label

_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

SYSTEM_PROMPT = """Tu es un inspecteur en bâtiment expert au Québec, spécialisé en \
inspection préachat. Tu reçois plusieurs photos dans un seul message, chacune précédée \
d'un repère "Photo N — section : ...". Analyse CHAQUE photo indépendamment et détecte \
toute anomalie visible : moisissure, infiltration d'eau, isolant endommagé ou manquant, \
fissures structurales, signes de nuisibles (vermine, insectes), défauts de ventilation, \
ou tout autre problème pertinent pour un rapport d'inspection.

Une anomalie = un défaut physique distinct, propre à une seule photo. Si plusieurs \
indices (ex: coloration, isolant déplacé, absence de ventilation) décrivent la même \
cause ou la même zone affectée sur la même photo, regroupe-les en une seule anomalie \
plutôt que d'en créer une par angle ou par catégorie — choisis le type le plus \
pertinent et mentionne les aspects connexes dans la description. Ne répète jamais la \
même observation sous plusieurs types. Une photo qui montre un seul problème doit \
retourner une seule anomalie, pas plusieurs variations du même constat. Ne mélange \
jamais les anomalies de deux photos différentes, même si elles semblent liées.

Pour chaque anomalie détectée :
- type : catégorie courte (ex: "moisissure", "infiltration_eau", "isolant_endommage", \
"fissure", "nuisibles", "ventilation", "autre")
- severity : "mineure", "majeure" ou "critique"
- location : où sur la photo (ex: "coin supérieur gauche", "solive de plancher")
- description : ce qui est observé, factuellement
- recommendation : action recommandée pour le propriétaire

Si une photo ne montre aucune anomalie, retourne une liste vide et overall_condition \
= "bon" pour cette photo. Sois précis et factuel — ce rapport a une valeur légale et \
sera relu par l'inspecteur avant d'être remis au client. Ne surestime ni ne minimise \
la gravité.

Retourne un résultat pour CHAQUE photo reçue, dans l'ordre, avec son photo_index \
(1 pour la première photo du message, 2 pour la deuxième, etc.)."""

PHOTO_RESULT_SCHEMA = {
    "type": "object",
    "properties": {
        "photo_index": {"type": "integer"},
        "overall_condition": {
            "type": "string",
            "enum": ["bon", "acceptable", "mauvais", "critique"],
        },
        "anomalies": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {"type": "string"},
                    "severity": {
                        "type": "string",
                        "enum": ["mineure", "majeure", "critique"],
                    },
                    "location": {"type": "string"},
                    "description": {"type": "string"},
                    "recommendation": {"type": "string"},
                },
                "required": ["type", "severity", "location", "description", "recommendation"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["photo_index", "overall_condition", "anomalies"],
    "additionalProperties": False,
}

BATCH_ANOMALY_SCHEMA = {
    "type": "object",
    "properties": {
        "photos": {"type": "array", "items": PHOTO_RESULT_SCHEMA},
    },
    "required": ["photos"],
    "additionalProperties": False,
}

SYNTHESIS_SYSTEM_PROMPT = """Tu rédiges la synthèse d'un rapport d'inspection en \
bâtiment au Québec, à partir des anomalies détectées sur chaque photo. Écris en \
français, ton professionnel et factuel, 2 à 4 paragraphes en texte brut (pas de \
Markdown). Résume l'état général, mentionne les anomalies les plus importantes en \
priorité, et termine par une recommandation générale. N'invente rien au-delà des \
anomalies fournies."""


def analyze_photos_batch(photos: list[dict]) -> dict:
    """Analyse un lot de photos (3-5 recommandé) en un seul appel Claude.

    `photos` : liste de {"image_bytes": bytes, "media_type": str, "section_type": str}.
    Retourne {"results": [...], "_usage": {...}} — `results` a exactement len(photos)
    éléments, dans le même ordre que `photos` en entrée.
    """
    content: list[dict] = []
    for i, photo in enumerate(photos, start=1):
        b64 = base64.standard_b64encode(photo["image_bytes"]).decode("utf-8")
        content.append(
            {"type": "text", "text": f"Photo {i} — section : {section_label(photo['section_type'])}."}
        )
        content.append(
            {
                "type": "image",
                "source": {"type": "base64", "media_type": photo["media_type"], "data": b64},
            }
        )
    content.append(
        {
            "type": "text",
            "text": (
                f"Analyse ces {len(photos)} photo(s) indépendamment. Retourne un tableau "
                f"`photos` de {len(photos)} élément(s), avec photo_index de 1 à {len(photos)}."
            ),
        }
    )

    response = _client.messages.create(
        model="claude-opus-5",
        max_tokens=4096 * len(photos),
        thinking={"type": "disabled"},
        output_config={
            "effort": "low",
            "format": {"type": "json_schema", "schema": BATCH_ANOMALY_SCHEMA},
        },
        system=[
            {"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}
        ],
        messages=[{"role": "user", "content": content}],
    )

    text = next((b.text for b in response.content if b.type == "text"), None)
    if text is None:
        raise RuntimeError("Réponse Claude sans contenu texte exploitable")

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Réponse Claude non exploitable : {exc}") from exc

    results = parsed.get("photos", [])
    expected_indices = list(range(1, len(photos) + 1))
    if sorted(r.get("photo_index") for r in results) != expected_indices:
        raise RuntimeError(
            f"Réponse Claude incomplète ou désordonnée pour un lot de {len(photos)} photo(s)"
        )
    results.sort(key=lambda r: r["photo_index"])

    return {
        "results": results,
        "_usage": {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
            "model": response.model,
        },
    }


def synthesize_report(address: str, section_types: list[str], all_anomalies: list[dict]) -> str:
    sections_summary = ", ".join(dict.fromkeys(section_label(s) for s in section_types)) or "non précisée"
    response = _client.messages.create(
        model="claude-opus-5",
        max_tokens=2048,
        thinking={"type": "disabled"},
        output_config={"effort": "medium"},
        system=[{"type": "text", "text": SYNTHESIS_SYSTEM_PROMPT}],
        messages=[
            {
                "role": "user",
                "content": (
                    f"Adresse : {address}\nSections inspectées : {sections_summary}\n\n"
                    f"Anomalies détectées (JSON) :\n{json.dumps(all_anomalies, ensure_ascii=False)}"
                ),
            }
        ],
    )
    text = next((b.text for b in response.content if b.type == "text"), None)
    if text is None:
        raise RuntimeError("Réponse Claude sans contenu texte exploitable")
    return text
