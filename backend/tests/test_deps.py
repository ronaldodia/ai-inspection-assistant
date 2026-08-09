import pytest
from fastapi import HTTPException

from app.deps import require_admin


def test_require_admin_allows_admin_role():
    user = {"id": "u1", "role": "admin"}
    assert require_admin(user) == user


def test_require_admin_rejects_inspector_role():
    user = {"id": "u1", "role": "inspector"}
    with pytest.raises(HTTPException) as exc_info:
        require_admin(user)
    assert exc_info.value.status_code == 403
