import os
from abc import ABC, abstractmethod

from app.config import settings

# "container" here means a logical bucket name — "photos" or "reports" — not a
# Docker container. Each backend maps it to a physical location (a local
# directory or an Azure Blob Storage container) read fresh from settings on
# every call, so overriding settings (e.g. in tests) works without needing to
# reconstruct the storage instance.


class Storage(ABC):
    @abstractmethod
    def write(self, container: str, path: str, data: bytes) -> None: ...

    @abstractmethod
    def read(self, container: str, path: str) -> bytes | None: ...


class LocalStorage(Storage):
    _DIR_SETTING = {"photos": "photos_dir", "reports": "reports_dir"}

    def _base_dir(self, container: str) -> str:
        return getattr(settings, self._DIR_SETTING[container])

    def write(self, container: str, path: str, data: bytes) -> None:
        abs_path = os.path.join(self._base_dir(container), path)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        with open(abs_path, "wb") as f:
            f.write(data)

    def read(self, container: str, path: str) -> bytes | None:
        abs_path = os.path.join(self._base_dir(container), path)
        if not os.path.isfile(abs_path):
            return None
        with open(abs_path, "rb") as f:
            return f.read()


class AzureBlobStorage(Storage):
    _CONTAINER_SETTING = {"photos": "azure_photos_container", "reports": "azure_reports_container"}

    def __init__(self) -> None:
        from azure.storage.blob import BlobServiceClient

        self._client = BlobServiceClient.from_connection_string(
            settings.azure_storage_connection_string
        )

    def _container_name(self, container: str) -> str:
        return getattr(settings, self._CONTAINER_SETTING[container])

    def write(self, container: str, path: str, data: bytes) -> None:
        blob = self._client.get_blob_client(container=self._container_name(container), blob=path)
        blob.upload_blob(data, overwrite=True)

    def read(self, container: str, path: str) -> bytes | None:
        from azure.core.exceptions import ResourceNotFoundError

        blob = self._client.get_blob_client(container=self._container_name(container), blob=path)
        try:
            return blob.download_blob().readall()
        except ResourceNotFoundError:
            return None


def get_storage() -> Storage:
    if settings.storage_backend == "azure":
        return AzureBlobStorage()
    return LocalStorage()


storage = get_storage()
