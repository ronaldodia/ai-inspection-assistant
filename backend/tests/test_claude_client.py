import json

import pytest

import app.claude_client as claude_client


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


def _photo_result(photo_index, overall_condition="mauvais", with_anomaly=True):
    return {
        "photo_index": photo_index,
        "overall_condition": overall_condition,
        "anomalies": (
            [
                {
                    "type": "moisissure",
                    "severity": "majeure",
                    "location": "coin supérieur gauche",
                    "description": "desc",
                    "recommendation": "rec",
                }
            ]
            if with_anomaly
            else []
        ),
    }


def _valid_batch_json(*photo_indices):
    return json.dumps({"photos": [_photo_result(i) for i in photo_indices]})


def _photo_input(section_type="comble"):
    return {"image_bytes": b"fake-bytes", "media_type": "image/jpeg", "section_type": section_type}


def test_analyze_photos_batch_parses_single_photo_response(monkeypatch):
    fake_create = FakeMessagesCreate(FakeResponse([FakeBlock("text", _valid_batch_json(1))]))
    monkeypatch.setattr(claude_client._client.messages, "create", fake_create)

    result = claude_client.analyze_photos_batch([_photo_input()])

    assert len(result["results"]) == 1
    assert result["results"][0]["overall_condition"] == "mauvais"
    assert len(result["results"][0]["anomalies"]) == 1
    assert result["_usage"] == {"input_tokens": 100, "output_tokens": 50, "model": "claude-opus-5"}


def test_analyze_photos_batch_returns_results_in_order(monkeypatch):
    # Réponse du modèle volontairement désordonnée (3, 1, 2) — le client doit
    # la retrier pour correspondre à l'ordre des photos envoyées.
    body = json.dumps({"photos": [_photo_result(3), _photo_result(1), _photo_result(2)]})
    fake_create = FakeMessagesCreate(FakeResponse([FakeBlock("text", body)]))
    monkeypatch.setattr(claude_client._client.messages, "create", fake_create)

    result = claude_client.analyze_photos_batch([_photo_input(), _photo_input(), _photo_input()])

    assert [r["photo_index"] for r in result["results"]] == [1, 2, 3]


def test_analyze_photos_batch_uses_french_section_label_in_prompt(monkeypatch):
    fake_create = FakeMessagesCreate(FakeResponse([FakeBlock("text", _valid_batch_json(1))]))
    monkeypatch.setattr(claude_client._client.messages, "create", fake_create)

    claude_client.analyze_photos_batch([_photo_input(section_type="vide_sanitaire")])

    content = fake_create.last_kwargs["messages"][0]["content"]
    prompt_text = content[0]["text"]
    assert "Vide sanitaire" in prompt_text


def test_analyze_photos_batch_raises_when_no_text_block(monkeypatch):
    fake_create = FakeMessagesCreate(FakeResponse([FakeBlock("other")]))
    monkeypatch.setattr(claude_client._client.messages, "create", fake_create)

    with pytest.raises(RuntimeError):
        claude_client.analyze_photos_batch([_photo_input()])


def test_analyze_photos_batch_raises_on_invalid_json(monkeypatch):
    fake_create = FakeMessagesCreate(FakeResponse([FakeBlock("text", "not valid json")]))
    monkeypatch.setattr(claude_client._client.messages, "create", fake_create)

    with pytest.raises(RuntimeError):
        claude_client.analyze_photos_batch([_photo_input()])


def test_analyze_photos_batch_raises_on_missing_results(monkeypatch):
    # Deux photos envoyées, une seule reçue en retour.
    fake_create = FakeMessagesCreate(FakeResponse([FakeBlock("text", _valid_batch_json(1))]))
    monkeypatch.setattr(claude_client._client.messages, "create", fake_create)

    with pytest.raises(RuntimeError):
        claude_client.analyze_photos_batch([_photo_input(), _photo_input()])


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
