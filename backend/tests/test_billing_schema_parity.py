from __future__ import annotations

from sqlalchemy import DateTime, Integer, String, UniqueConstraint

from app.models import Base, BillingCheckoutClaim, User


def test_billing_generation_columns_match_migration_0007() -> None:
    for name in ("stripe_checkout_generation", "stripe_state_generation"):
        column = User.__table__.c[name]
        assert isinstance(column.type, Integer)
        assert column.nullable is False
        assert column.default.arg == 0
        assert str(column.server_default.arg) == "0"


def test_billing_checkout_claim_matches_migration_0007() -> None:
    table = BillingCheckoutClaim.__table__
    assert Base.metadata.tables["billing_checkout_claims"] is table
    assert {column.name for column in table.primary_key} == {"user_id"}

    expected_strings = {
        "token": (64, False),
        "plan_id": (32, False),
        "price_id": (255, False),
        "locale": (8, False),
        "customer_id": (255, True),
        "customer_email": (255, False),
        "success_url": (2048, False),
        "cancel_url": (2048, False),
        "session_id": (255, True),
    }
    for name, (length, nullable) in expected_strings.items():
        column = table.c[name]
        assert isinstance(column.type, String)
        assert column.type.length == length
        assert column.nullable is nullable

    generation = table.c.generation
    assert isinstance(generation.type, Integer)
    assert generation.nullable is False
    assert generation.server_default is None

    for name in (
        "lease_expires_at",
        "checkout_expires_at",
        "created_at",
        "updated_at",
    ):
        column = table.c[name]
        assert isinstance(column.type, DateTime)
        assert column.type.timezone is True
        assert column.nullable is False
    assert table.c.created_at.server_default is not None
    assert table.c.updated_at.server_default is not None

    foreign_key = next(iter(table.c.user_id.foreign_keys))
    assert foreign_key.target_fullname == "users.id"
    assert foreign_key.ondelete == "CASCADE"
    unique = [
        constraint
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
    ]
    assert len(unique) == 1
    assert unique[0].name == "uq_billing_checkout_claims_session_id"
    assert {column.name for column in unique[0].columns} == {"session_id"}
