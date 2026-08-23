from app.config import settings
from app.storage import LocalStorage, get_storage


def test_local_storage_write_then_read_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "photos_dir", str(tmp_path / "photos"))
    store = LocalStorage()

    store.write("photos", "abc/photo.jpg", b"fake-image-bytes")

    assert store.read("photos", "abc/photo.jpg") == b"fake-image-bytes"


def test_local_storage_read_missing_file_returns_none(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "photos_dir", str(tmp_path / "photos"))
    store = LocalStorage()

    assert store.read("photos", "does-not-exist.jpg") is None


def test_local_storage_write_creates_nested_directories(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "reports_dir", str(tmp_path / "reports"))
    store = LocalStorage()

    store.write("reports", "nested/dir/report.pdf", b"%PDF-fake")

    assert (tmp_path / "reports" / "nested" / "dir" / "report.pdf").read_bytes() == b"%PDF-fake"


def test_local_storage_delete_removes_file(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "photos_dir", str(tmp_path / "photos"))
    store = LocalStorage()
    store.write("photos", "abc/photo.jpg", b"fake-image-bytes")

    store.delete("photos", "abc/photo.jpg")

    assert store.read("photos", "abc/photo.jpg") is None


def test_local_storage_delete_missing_file_is_a_noop(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "photos_dir", str(tmp_path / "photos"))
    store = LocalStorage()

    store.delete("photos", "does-not-exist.jpg")  # ne doit pas lever d'exception


def test_get_storage_returns_local_storage_by_default(monkeypatch):
    monkeypatch.setattr(settings, "storage_backend", "local")
    assert isinstance(get_storage(), LocalStorage)
