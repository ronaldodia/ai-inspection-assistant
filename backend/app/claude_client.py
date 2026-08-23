import base64
import json

import anthropic

from app.config import settings
from app.constants import BUILDING_TYPE_LABELS, SECTION_LABELS, building_type_label, section_label
from app.knowledge import get_context_for_section

_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

SYSTEM_PROMPT = """Tu es un inspecteur en bâtiment expert au Québec, spécialisé en \
inspection préachat. Analyse la photo fournie et détecte toute anomalie visible : \
moisissure, infiltration d'eau, isolant endommagé ou manquant, fissures structurales, \
signes de nuisibles (vermine, insectes), défauts de ventilation, ou tout autre problème \
pertinent pour un rapport d'inspection.

Une anomalie = un défaut physique distinct. Si plusieurs indices (ex: coloration, \
isolant déplacé, absence de ventilation) décrivent la même cause ou la même zone \
affectée, regroupe-les en une seule anomalie plutôt que d'en créer une par angle ou \
par catégorie — choisis le type le plus pertinent et mentionne les aspects connexes \
dans la description. Ne répète jamais la même observation sous plusieurs types. Une \
photo qui montre un seul problème doit retourner une seule anomalie, pas plusieurs \
variations du même constat.

Pour chaque anomalie détectée :
- type : catégorie courte (ex: "moisissure", "infiltration_eau", "isolant_endommage", \
"fissure", "nuisibles", "ventilation", "autre")
- severity : une des 5 catégories suivantes, dans cet ordre de gravité —
  "securite" (danger immédiat pour les occupants, ex: risque électrique, gaz, \
  structure compromise — nécessite une action avant l'occupation ou la transaction),
  "majeur" (affecte la fonction ou la valeur du bâtiment, sans danger immédiat),
  "mineur" (défaut n'affectant ni la sécurité ni la fonction de façon significative),
  "entretien" (maintenance préventive à prévoir, pas un défaut en soi),
  "observation" (note informative, sans action requise).
- location : où sur la photo (ex: "coin supérieur gauche", "solive de plancher")
- description : ce qui est observé, factuellement
- recommendation : action recommandée pour le propriétaire

Si la photo ne montre aucune anomalie, retourne une liste vide et overall_condition \
= "bon". Sois précis et factuel — ce rapport a une valeur légale et sera relu par \
l'inspecteur avant d'être remis au client. Ne surestime ni ne minimise la gravité — \
en particulier, ne classe "securite" que pour un danger réel et immédiat, pas par \
excès de prudence."""

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
                        "enum": ["securite", "majeur", "mineur", "entretien", "observation"],
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


DISCLOSURE_SYSTEM_PROMPT = f"""Tu extrais les informations utiles d'une déclaration \
du vendeur (formulaire immobilier standard au Québec, ex. OACIQ — vices connus, \
rénovations, systèmes présents, garanties) pour préremplir un dossier d'inspection \
préachat.

Extrais :
- address : l'adresse du bâtiment si elle apparaît clairement (sinon null)
- building_type : une des valeurs suivantes si déterminable — \
{', '.join(BUILDING_TYPE_LABELS)} (sinon null)
- year_built : l'année de construction si mentionnée (sinon null)
- disclosure_items : les éléments pertinents pour un inspecteur. Pour chacun :
  - category : une des valeurs suivantes, celle qui correspond le mieux au système \
concerné — {', '.join(SECTION_LABELS)}
  - type : "vice_connu" (problème déclaré par le vendeur), "renovation" (travaux \
effectués), "systeme_present" (ex: type de chauffage, présence d'une piscine), \
"garantie" (garantie active) ou "observation" (autre information pertinente)
  - description : résumé factuel et concis en français de ce qui est déclaré
  - year : année associée si mentionnée (sinon null)

Ce document a une valeur légale — retranscris fidèlement ce qui est écrit, \
n'invente rien et ne réinterprète pas. Si une information n'est pas présente dans \
le document, retourne null (ou omets l'entrée) plutôt que de deviner."""

DISCLOSURE_SCHEMA = {
    "type": "object",
    "properties": {
        "address": {"type": ["string", "null"]},
        "building_type": {"type": ["string", "null"]},
        "year_built": {"type": ["integer", "null"]},
        "disclosure_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "category": {"type": "string"},
                    "type": {
                        "type": "string",
                        "enum": ["vice_connu", "renovation", "systeme_present", "garantie", "observation"],
                    },
                    "description": {"type": "string"},
                    "year": {"type": ["integer", "null"]},
                },
                "required": ["category", "type", "description"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["disclosure_items"],
    "additionalProperties": False,
}


def extract_disclosure(document_bytes: bytes, media_type: str) -> dict:
    b64 = base64.standard_b64encode(document_bytes).decode("utf-8")
    block_type = "document" if media_type == "application/pdf" else "image"
    response = _client.messages.create(
        model="claude-opus-5",
        max_tokens=4096,
        thinking={"type": "disabled"},
        output_config={
            "effort": "medium",
            "format": {"type": "json_schema", "schema": DISCLOSURE_SCHEMA},
        },
        system=[{"type": "text", "text": DISCLOSURE_SYSTEM_PROMPT}],
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": block_type,
                        "source": {"type": "base64", "media_type": media_type, "data": b64},
                    },
                    {
                        "type": "text",
                        "text": "Extrait les informations utiles de cette déclaration du vendeur.",
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

    # Le schéma JSON ne peut pas contraindre building_type à la fois nullable et
    # limité à BUILDING_TYPE_LABELS — validé ici pour ne jamais faire remonter une
    # valeur qui ne correspondrait à aucune option du <select> du frontend.
    if result.get("building_type") not in BUILDING_TYPE_LABELS:
        result["building_type"] = None

    return result


def _build_analysis_prompt(
    section_type: str, building_type: str | None = None, year_built: int | None = None
) -> str:
    prompt = f"Section du bâtiment inspectée : {section_label(section_type)}."

    building_bits = []
    if building_type:
        building_bits.append(building_type_label(building_type))
    if year_built:
        building_bits.append(f"construit en {year_built}")
    if building_bits:
        prompt += f" Bâtiment : {', '.join(building_bits)}."

    prompt += " Analyse cette photo."

    context = get_context_for_section(section_type)
    if context:
        prompt += (
            "\n\nExtraits pertinents du Code de construction du Québec et de la norme "
            f"de pratique AIBQ pour cette section :\n{context}\n\n"
            "Utilise ces extraits uniquement s'ils sont pertinents à ce que tu observes "
            "sur la photo. Ne cite jamais un article ou une référence qui n'apparaît pas "
            "explicitement ci-dessus — si aucun extrait n'est pertinent, ignore-les."
        )
    return prompt


def analyze_photo(
    image_bytes: bytes,
    media_type: str,
    section_type: str,
    building_type: str | None = None,
    year_built: int | None = None,
) -> dict:
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
                        "text": _build_analysis_prompt(section_type, building_type, year_built),
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
