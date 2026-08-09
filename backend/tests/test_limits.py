from app.config import settings
from app.limits import (
    effective_inspection_limit,
    effective_photo_limit,
    inspection_limit_reached,
    photo_limit_reached,
)


def test_effective_inspection_limit_uses_default_when_none():
    user = {"max_inspections": None}
    assert effective_inspection_limit(user) == settings.default_max_inspections


def test_effective_inspection_limit_uses_custom_value():
    user = {"max_inspections": 7}
    assert effective_inspection_limit(user) == 7


def test_effective_photo_limit_uses_default_when_none():
    user = {"max_photos_per_inspection": None}
    assert effective_photo_limit(user) == settings.default_max_photos_per_inspection


def test_effective_photo_limit_uses_custom_value():
    user = {"max_photos_per_inspection": 5}
    assert effective_photo_limit(user) == 5


def test_inspection_limit_reached_true_when_at_limit():
    user = {"max_inspections": 3}
    assert inspection_limit_reached(3, user) is True


def test_inspection_limit_reached_false_when_below_limit():
    user = {"max_inspections": 3}
    assert inspection_limit_reached(2, user) is False


def test_photo_limit_reached_true_when_over_limit():
    user = {"max_photos_per_inspection": 10}
    assert photo_limit_reached(11, user) is True


def test_photo_limit_reached_false_when_below_limit():
    user = {"max_photos_per_inspection": 10}
    assert photo_limit_reached(0, user) is False
