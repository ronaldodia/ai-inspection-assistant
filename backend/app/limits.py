from typing import Mapping

from app.config import settings


def effective_inspection_limit(user: Mapping) -> int:
    """Limite du nombre d'inspections (hors archivées) pour cet inspecteur."""
    limit = user.get("max_inspections")
    return limit if limit is not None else settings.default_max_inspections


def effective_photo_limit(user: Mapping) -> int:
    """Limite du nombre de photos par inspection pour cet inspecteur."""
    limit = user.get("max_photos_per_inspection")
    return limit if limit is not None else settings.default_max_photos_per_inspection


def inspection_limit_reached(current_count: int, user: Mapping) -> bool:
    return current_count >= effective_inspection_limit(user)


def photo_limit_reached(current_count: int, user: Mapping) -> bool:
    return current_count >= effective_photo_limit(user)
