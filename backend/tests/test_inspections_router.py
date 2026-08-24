import pytest
from fastapi import HTTPException

# app.routers.inspections imports app.pdf, which imports weasyprint at module
# level — requires WeasyPrint's native GTK libs to be installed (present on
# CI via apt-get, not on every local dev machine — same pre-existing,
# unrelated gap as tests/test_pdf.py, which has the same requirement). Do not
# stub sys.modules["weasyprint"] here: it's a process-wide mutation that would
# leak into every other test module collected in the same pytest run
# (including test_pdf.py, which needs the real WeasyPrint.HTML) since Python
# caches imports globally, not per test file.
import app.routers.inspections as inspections_router


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
