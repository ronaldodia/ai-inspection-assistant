import sys
import types

import pytest
from fastapi import HTTPException

# app.routers.inspections imports app.pdf, which imports weasyprint at module
# level — weasyprint needs native GTK libs not installed on this machine (same
# pre-existing, unrelated gap as tests/test_pdf.py). Stub it so this file's
# import chain doesn't require WeasyPrint to actually render anything.
if "weasyprint" not in sys.modules:
    _fake_weasyprint = types.ModuleType("weasyprint")
    _fake_weasyprint.HTML = object
    sys.modules["weasyprint"] = _fake_weasyprint

import app.routers.inspections as inspections_router  # noqa: E402


class _FakeFile:
    def __init__(self, contents: bytes):
        self._contents = contents

    def read(self):
        return self._contents


class FakeUploadFile:
    def __init__(self, content_type: str, contents: bytes):
        self.content_type = content_type
        self.file = _FakeFile(contents)


def test_extract_disclosure_document_rejects_unsupported_content_type():
    file = FakeUploadFile("application/zip", b"data")
    with pytest.raises(HTTPException) as exc_info:
        inspections_router.extract_disclosure_document(file=file, user={"id": "u1"})
    assert exc_info.value.status_code == 400


def test_extract_disclosure_document_rejects_oversized_file():
    file = FakeUploadFile("application/pdf", b"x" * (inspections_router.MAX_DISCLOSURE_BYTES + 1))
    with pytest.raises(HTTPException) as exc_info:
        inspections_router.extract_disclosure_document(file=file, user={"id": "u1"})
    assert exc_info.value.status_code == 400


def test_extract_disclosure_document_returns_extraction_result(monkeypatch):
    monkeypatch.setattr(
        inspections_router,
        "extract_disclosure",
        lambda contents, media_type: {"address": "123 rue Test", "disclosure_items": []},
    )
    file = FakeUploadFile("application/pdf", b"fake-pdf")

    result = inspections_router.extract_disclosure_document(file=file, user={"id": "u1"})

    assert result == {"address": "123 rue Test", "disclosure_items": []}


def test_extract_disclosure_document_wraps_runtime_error_as_502(monkeypatch):
    def _raise(contents, media_type):
        raise RuntimeError("boom")

    monkeypatch.setattr(inspections_router, "extract_disclosure", _raise)
    file = FakeUploadFile("application/pdf", b"fake-pdf")

    with pytest.raises(HTTPException) as exc_info:
        inspections_router.extract_disclosure_document(file=file, user={"id": "u1"})
    assert exc_info.value.status_code == 502
