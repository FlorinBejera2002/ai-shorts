from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.deps import enforce_content_role


@pytest.mark.parametrize(
    "role,method,allowed",
    [
        ("member", "POST", True),
        ("member", "DELETE", True),
        ("viewer", "GET", True),
        ("viewer", "POST", False),
        ("viewer", "PATCH", False),
        ("viewer", "DELETE", False),
        ("admin", "POST", False),
        (None, "GET", False),
    ],
)
def test_content_role_matrix(role, method, allowed):
    user = SimpleNamespace(access_role=role)
    if allowed:
        enforce_content_role(user, method)
    else:
        with pytest.raises(HTTPException) as error:
            enforce_content_role(user, method)
        assert error.value.status_code == 403
