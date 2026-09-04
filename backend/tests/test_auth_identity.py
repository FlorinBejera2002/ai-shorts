from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.deps import get_authenticated_user
from app.config import settings
from app.models.user import User


class _AuthDb:
    def __init__(self, *, by_id=None, by_email=None) -> None:
        self.by_id = by_id
        self.by_email = by_email
        self.id_lookups = []
        self.email_lookups = 0
        self.added = []
        self.commits = 0

    async def get(self, model, key):
        assert model is User
        self.id_lookups.append(key)
        return self.by_id

    async def execute(self, statement):
        self.email_lookups += 1
        return SimpleNamespace(scalar_one_or_none=lambda: self.by_email)

    def add(self, user):
        self.added.append(user)

    async def commit(self):
        self.commits += 1

    async def refresh(self, user):
        user.id = user.id or uuid.uuid4()


def _authenticate(db, *, user_id=None, email=None):
    return asyncio.run(
        get_authenticated_user(
            x_internal_api_key="valid-internal-key",
            x_user_id=user_id,
            x_user_email=email,
            db=db,
        )
    )


@pytest.fixture(autouse=True)
def _auth_configuration(monkeypatch):
    monkeypatch.setattr(settings, "internal_api_key", "valid-internal-key")
    monkeypatch.setattr(settings, "app_env", "development")


@pytest.mark.parametrize("environment", ["development", "production", "staging"])
def test_missing_explicit_user_id_never_falls_back_to_email(
    monkeypatch, environment
) -> None:
    monkeypatch.setattr(settings, "app_env", environment)
    # Even a matching existing email must not replace the explicit identity.
    db = _AuthDb(by_email=SimpleNamespace(id=uuid.uuid4()))
    missing_id = uuid.uuid4()

    with pytest.raises(HTTPException) as error:
        _authenticate(db, user_id=str(missing_id), email="deleted@example.com")

    assert error.value.status_code == 401
    assert db.id_lookups == [missing_id]
    assert db.email_lookups == 0
    assert db.added == []
    assert db.commits == 0


@pytest.mark.parametrize("user_id", ["", "not-a-uuid", " "])
def test_invalid_explicit_user_id_never_falls_back_to_email(user_id) -> None:
    db = _AuthDb()
    with pytest.raises(HTTPException) as error:
        _authenticate(db, user_id=user_id, email="developer@example.com")
    assert error.value.status_code == 400
    assert db.email_lookups == 0
    assert db.added == []


def test_existing_explicit_user_id_remains_authoritative() -> None:
    user = SimpleNamespace(id=uuid.uuid4())
    db = _AuthDb(by_id=user)
    assert (
        _authenticate(db, user_id=str(user.id), email="different@example.com") is user
    )
    assert db.email_lookups == 0


@pytest.mark.parametrize("environment", ["production", "staging", "test"])
def test_email_only_missing_user_cannot_be_provisioned_outside_development(
    monkeypatch, environment
) -> None:
    monkeypatch.setattr(settings, "app_env", environment)
    db = _AuthDb()
    with pytest.raises(HTTPException) as error:
        _authenticate(db, email="new@example.com")
    assert error.value.status_code == 401
    assert db.added == []
    assert db.commits == 0


def test_existing_email_only_internal_lookup_is_preserved(monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    user = SimpleNamespace(id=uuid.uuid4())
    db = _AuthDb(by_email=user)
    assert _authenticate(db, email="existing@example.com") is user
    assert db.added == []


def test_email_only_development_provisioning_is_preserved() -> None:
    db = _AuthDb()
    user = _authenticate(db, email="developer@example.com")
    assert user.email == "developer@example.com"
    assert user.provider == "header-dev"
    assert db.added == [user]
    assert db.commits == 1


@pytest.mark.parametrize("environment", ["production", "staging", "preview"])
def test_deployed_environment_fails_closed_without_internal_key(
    monkeypatch, environment
):
    monkeypatch.setattr(settings, "app_env", environment)
    monkeypatch.setattr(settings, "internal_api_key", "")
    db = _AuthDb(by_id=SimpleNamespace(id=uuid.uuid4()))
    with pytest.raises(HTTPException) as error:
        _authenticate(db, user_id=str(uuid.uuid4()))
    assert error.value.status_code == 503
    assert db.id_lookups == []
