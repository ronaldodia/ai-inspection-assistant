import json

import pytest

import app.claude_client as claude_client


@pytest.fixture(autouse=True)
def _no_network_knowledge_context(monkeypatch):
    # analyze_photo() pulls RAG context via app.knowledge.get_context_for_section
    # (Voyage AI + Postgres) — out of scope for this DB-free/network-free suite
    # (see tests/conftest.py). claude_client imports the function by name
    # (`from app.knowledge import get_context_for_section`), so it must be patched
    # where it's looked up (app.claude_client), not on app.knowledge itself.
    monkeypatch.setattr(claude_client, "get_context_for_section", lambda section_type, k=4: "")


class FakeBlock:
    def __init__(self, type_, text=None):
        self.type = type_
        self.text = text


class FakeUsage:
    def __init__(self, input_tokens=100, output_tokens=50):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class FakeResponse:
    def __init__(self, content, model="claude-opus-5", usage=None):
        self.content = content
        self.model = model
        self.usage = usage or FakeUsage()


class FakeMessagesCreate:
    """Records the last call and returns a preset response."""

    def __init__(self, response):
        self.response = response
        self.last_kwargs = None

    def __call__(self, **kwargs):
        self.last_kwargs = kwargs
        return self.response


def _valid_analysis_json():
    return json.dumps(
        {
            "overall_condition": "mauvais",
            "anomalies": [
                {
                    "type": "moisissure",
                    "severity": "majeure",
                    "location": "coin supérieur gauche",
                    "description": "desc",
                    "recommendation": "rec",
                }
            ],
        }
    )


def test_analyze_photo_parses_valid_response(monkeypatch):
    fake_create = FakeMessagesCreate(FakeResponse([FakeBlock("text", _valid_analysis_json())]))
    monkeypatch.setattr(claude_client._client.messages, "create", fake_create)

    result = claude_client.analyze_photo(b"fake-bytes", "image/jpeg", "comble")

    assert result["overall_condition"] == "mauvais"
    assert len(result["anomalies"]) == 1
    assert result["_usage"] == {"input_tokens": 100, "output_tokens": 50, "model": "claude-opus-5"}


def test_analyze_photo_uses_french_section_label_in_prompt(monkeypatch):
    fake_create = FakeMessagesCreate(FakeResponse([FakeBlock("text", _valid_analysis_json())]))
    monkeypatch.setattr(claude_client._client.messages, "create", fake_create)

    claude_client.analyze_photo(b"fake-bytes", "image/jpeg", "vide_sanitaire")

    prompt_text = fake_create.last_kwargs["messages"][0]["content"][1]["text"]
    assert "Vide sanitaire" in prompt_text


def test_analyze_photo_injects_knowledge_context_when_available(monkeypatch):
    monkeypatch.setattr(
        claude_client, "get_context_for_section", lambda section_type, k=4: "- extrait pertinent (Article 9.13)"
    )
    fake_create = FakeMessagesCreate(FakeResponse([FakeBlock("text", _valid_analysis_json())]))
    monkeypatch.setattr(claude_client._client.messages, "create", fake_create)

    claude_client.analyze_photo(b"fake-bytes", "image/jpeg", "comble")

    prompt_text = fake_create.last_kwargs["messages"][0]["content"][1]["text"]
    assert "extrait pertinent (Article 9.13)" in prompt_text
    assert "Ne cite jamais un article" in prompt_text


def test_analyze_photo_omits_knowledge_block_when_no_context(monkeypatch):
    fake_create = FakeMessagesCreate(FakeResponse([FakeBlock("text", _valid_analysis_json())]))
    monkeypatch.setattr(claude_client._client.messages, "create", fake_create)

    claude_client.analyze_photo(b"fake-bytes", "image/jpeg", "comble")

    prompt_text = fake_create.last_kwargs["messages"][0]["content"][1]["text"]
    assert "Extraits pertinents" not in prompt_text


def test_analyze_photo_raises_when_no_text_block(monkeypatch):
    fake_create = FakeMessagesCreate(FakeResponse([FakeBlock("other")]))
    monkeypatch.setattr(claude_client._client.messages, "create", fake_create)

    with pytest.raises(RuntimeError):
        claude_client.analyze_photo(b"fake-bytes", "image/jpeg", "comble")


def test_analyze_photo_raises_on_invalid_json(monkeypatch):
    fake_create = FakeMessagesCreate(FakeResponse([FakeBlock("text", "not valid json")]))
    monkeypatch.setattr(claude_client._client.messages, "create", fake_create)

    with pytest.raises(RuntimeError):
        claude_client.analyze_photo(b"fake-bytes", "image/jpeg", "comble")


def test_synthesize_report_returns_text(monkeypatch):
    fake_create = FakeMessagesCreate(FakeResponse([FakeBlock("text", "Synthèse générée.")]))
    monkeypatch.setattr(claude_client._client.messages, "create", fake_create)

    result = claude_client.synthesize_report("123 rue Test", ["comble"], [])

    assert result == "Synthèse générée."


def test_synthesize_report_dedupes_and_translates_section_labels(monkeypatch):
    fake_create = FakeMessagesCreate(FakeResponse([FakeBlock("text", "ok")]))
    monkeypatch.setattr(claude_client._client.messages, "create", fake_create)

    claude_client.synthesize_report("123 rue Test", ["comble", "comble", "autre"], [])

    prompt_text = fake_create.last_kwargs["messages"][0]["content"]
    assert "Sections inspectées : Comble, Autre" in prompt_text


def test_synthesize_report_defaults_when_no_sections(monkeypatch):
    fake_create = FakeMessagesCreate(FakeResponse([FakeBlock("text", "ok")]))
    monkeypatch.setattr(claude_client._client.messages, "create", fake_create)

    claude_client.synthesize_report("123 rue Test", [], [])

    prompt_text = fake_create.last_kwargs["messages"][0]["content"]
    assert "Sections inspectées : non précisée" in prompt_text


def test_synthesize_report_raises_when_no_text_block(monkeypatch):
    fake_create = FakeMessagesCreate(FakeResponse([FakeBlock("other")]))
    monkeypatch.setattr(claude_client._client.messages, "create", fake_create)

    with pytest.raises(RuntimeError):
        claude_client.synthesize_report("123 rue Test", ["comble"], [])
