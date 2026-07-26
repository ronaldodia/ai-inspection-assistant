import base64
import json

import anthropic

from app.config import settings
from app.constants import section_label

_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

SYSTEM_PROMPT = """Tu es un inspecteur en bâtiment expert au Québec, spécialisé en \
inspection préachat. Analyse la photo fournie et détecte toute anomalie visible : \
moisissure, infiltration d'eau, isolant endommagé ou manquant, fissures structurales, \
signes de nuisibles (vermine, insectes), défauts de ventilation, ou tout autre problème \
pertinent pour un rapport d'inspection.

Pour chaque anomalie détectée :
- type : catégorie courte (ex: "moisissure", "infiltration_eau", "isolant_endommage", \
"fissure", "nuisibles", "ventilation", "autre")
- severity : "mineure", "majeure" ou "critique"
- location : où sur la photo (ex: "coin supérieur gauche", "solive de plancher")
- description : ce qui est observé, factuellement
- recommendation : action recommandée pour le propriétaire

Si la photo ne montre aucune anomalie, retourne une liste vide et overall_condition \
= "bon". Sois précis et factuel — ce rapport a une valeur légale et sera relu par \
l'inspecteur avant d'être remis au client. Ne surestime ni ne minimise la gravité."""

ANOMALY_SCHEMA = {
    "type": "object",
    "properties": {
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
    "required": ["overall_condition", "anomalies"],
    "additionalProperties": False,
}

SYNTHESIS_SYSTEM_PROMPT = """Tu rédiges la synthèse d'un rapport d'inspection en \
bâtiment au Québec, à partir des anomalies détectées sur chaque photo. Écris en \
français, ton professionnel et factuel, 2 à 4 paragraphes en texte brut (pas de \
Markdown). Résume l'état général, mentionne les anomalies les plus importantes en \
priorité, et termine par une recommandation générale. N'invente rien au-delà des \
anomalies fournies."""


def analyze_photo(image_bytes: bytes, media_type: str, section_type: str) -> dict:
    b64 = base64.standard_b64encode(image_bytes).decode("utf-8")
    response = _client.messages.create(
        model="claude-opus-5",
        max_tokens=4096,
        thinking={"type": "disabled"},
        output_config={
            "effort": "low",
            "format": {"type": "json_schema", "schema": ANOMALY_SCHEMA},
        },
        system=[
            {"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}
        ],
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": media_type, "data": b64},
                    },
                    {
                        "type": "text",
                        "text": f"Section du bâtiment inspectée : {section_label(section_type)}. Analyse cette photo.",
                    },
                ],
            }
        ],
    )

    text = next((b.text for b in response.content if b.type == "text"), None)
    if text is None:
        raise RuntimeError("Réponse Claude sans contenu texte exploitable")

    try:
        result = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Réponse Claude non exploitable : {exc}") from exc

    result["_usage"] = {
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "model": response.model,
    }
    return result


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
