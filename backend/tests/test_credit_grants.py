"""Real PostgreSQL checks; only a disposable loopback integration database."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import threading
import uuid

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DataError
from sqlalchemy.pool import NullPool

from app.services.credit_grants import apply_credit_grant, preview_credit_grant

CUTOFF = datetime(2026, 9, 11, 16, 15, 41, 130482, tzinfo=timezone.utc)


@pytest.fixture
def grant_db():
    raw = os.environ.get("SNEEPCUT_TEST_DATABASE_URL")
    if not raw:
        pytest.skip("SNEEPCUT_TEST_DATABASE_URL must name a disposable PostgreSQL database")
    url = make_url(raw)
    assert url.host in {"localhost", "127.0.0.1", "::1"}
    assert url.database == "sneepcut_integration_test"
    schema = "test_credit_grants_" + uuid.uuid4().hex
    admin = create_engine(url, poolclass=NullPool)
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    try:
        migrate(engine, "head")
        yield engine
    finally:
        engine.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


def migrate(engine, revision, *, downgrade=False):
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).parents[1] / "alembic"))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        (command.downgrade if downgrade else command.upgrade)(config, revision)


def user(engine, credits, created_at=CUTOFF - timedelta(days=1)):
    identifier = uuid.uuid4()
    with engine.begin() as connection:
        connection.execute(text("""
            INSERT INTO users (id, email, provider, credits, plan, created_at)
            VALUES (:id, :email, 'credentials', :credits, 'free', :created_at)
        """), {"id": identifier, "email": f"{identifier}@example.invalid",
               "credits": credits, "created_at": created_at})
    return identifier


def balances(engine):
    with engine.connect() as connection:
        return dict(connection.execute(text("SELECT id, credits FROM users")).all())


def count(engine, table):
    assert table in {"credit_grant_batches", "credit_grant_recipients"}
    with engine.connect() as connection:
        return connection.execute(text(f"SELECT count(*) FROM {table}")).scalar_one()


@pytest.mark.parametrize("amount", [100, 1000])
def test_additive_preview_cutoff_audit_and_retry(grant_db, amount):
    earlier = user(grant_db, 70)
    boundary = user(grant_db, 15, CUTOFF)
    later = user(grant_db, 1000, CUTOFF + timedelta(microseconds=1))
    parameters = {"batch_key": "existing-users-20260911", "amount": amount, "cutoff": CUTOFF}
    preview = preview_credit_grant(grant_db, **parameters)
    assert preview["status"] == "preview"
    assert preview["recipients"] == 2
    assert preview["balance_total_before"] == 85
    assert count(grant_db, "credit_grant_batches") == 0
    assert balances(grant_db) == {earlier: 70, boundary: 15, later: 1000}

    applied = apply_credit_grant(grant_db, **parameters)
    assert applied["status"] == "applied"
    assert applied["total_granted"] == 2 * amount
    assert applied["balance_total_after"] == 85 + 2 * amount
    assert balances(grant_db) == {earlier: 70 + amount, boundary: 15 + amount, later: 1000}
    assert count(grant_db, "credit_grant_recipients") == 2
    with grant_db.connect() as connection:
        audit = connection.execute(text("""
            SELECT user_id, balance_before, balance_after FROM credit_grant_recipients
        """)).all()
    assert set(audit) == {(earlier, 70, 70 + amount), (boundary, 15, 15 + amount)}
    before_retry = balances(grant_db)
    assert apply_credit_grant(grant_db, **parameters)["status"] == "already_applied"
    assert preview_credit_grant(grant_db, **parameters)["status"] == "already_applied"
    assert balances(grant_db) == before_retry


def test_concurrent_retries_apply_once(grant_db):
    identifiers = [user(grant_db, value) for value in (0, 70, 290)]
    barrier = threading.Barrier(8)

    def grant():
        barrier.wait(timeout=10)
        return apply_credit_grant(grant_db, batch_key="same-batch", amount=100, cutoff=CUTOFF)

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: grant(), range(8)))
    assert [result["status"] for result in results].count("applied") == 1
    assert [result["status"] for result in results].count("already_applied") == 7
    assert balances(grant_db) == dict(zip(identifiers, (100, 170, 390)))
    assert count(grant_db, "credit_grant_batches") == 1
    assert count(grant_db, "credit_grant_recipients") == 3


def test_concurrent_account_changes_are_not_lost(grant_db):
    identifier = user(grant_db, 500)
    barrier = threading.Barrier(3)

    def adjust(delta):
        barrier.wait(timeout=10)
        with grant_db.begin() as connection:
            connection.execute(text("UPDATE users SET credits=credits+:delta WHERE id=:id"),
                               {"delta": delta, "id": identifier})

    def grant():
        barrier.wait(timeout=10)
        return apply_credit_grant(grant_db, batch_key="concurrent-spend", amount=100, cutoff=CUTOFF)

    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(adjust, -30), pool.submit(adjust, 70), pool.submit(grant)]
        for future in futures:
            future.result(timeout=20)
    assert balances(grant_db)[identifier] == 640
    with grant_db.connect() as connection:
        delta = connection.execute(text("""
            SELECT balance_after-balance_before FROM credit_grant_recipients
        """)).scalar_one()
    assert delta == 100


@pytest.mark.parametrize("change", [{"amount": 1000}, {"cutoff": CUTOFF + timedelta(seconds=1)}])
def test_mismatched_batch_parameters_are_rejected(grant_db, change):
    identifier = user(grant_db, 50)
    parameters = {"batch_key": "immutable", "amount": 100, "cutoff": CUTOFF}
    apply_credit_grant(grant_db, **parameters)
    for operation in (apply_credit_grant, preview_credit_grant):
        with pytest.raises(ValueError, match="different amount or cutoff"):
            operation(grant_db, **{**parameters, **change})
    assert balances(grant_db)[identifier] == 150
    assert count(grant_db, "credit_grant_batches") == 1


def test_failure_rolls_back_balances_and_audit_then_retry_succeeds(grant_db):
    normal = user(grant_db, 50)
    overflowing = user(grant_db, 2_147_483_647)
    parameters = {"batch_key": "atomic-rollback", "amount": 100, "cutoff": CUTOFF}
    with pytest.raises(DataError):
        apply_credit_grant(grant_db, **parameters)
    assert balances(grant_db) == {normal: 50, overflowing: 2_147_483_647}
    assert count(grant_db, "credit_grant_batches") == 0
    assert count(grant_db, "credit_grant_recipients") == 0
    with grant_db.begin() as connection:
        connection.execute(text("UPDATE users SET credits=0 WHERE id=:id"), {"id": overflowing})
    assert apply_credit_grant(grant_db, **parameters)["status"] == "applied"
    assert balances(grant_db) == {normal: 150, overflowing: 100}


def test_zero_recipient_batch_cannot_later_apply_to_backdated_accounts(grant_db):
    parameters = {"batch_key": "empty-cohort", "amount": 100, "cutoff": CUTOFF}
    assert apply_credit_grant(grant_db, **parameters)["recipients"] == 0
    identifier = user(grant_db, 70)
    assert apply_credit_grant(grant_db, **parameters)["status"] == "already_applied"
    assert balances(grant_db)[identifier] == 70


def test_audit_survives_account_deletion_and_blocks_destructive_downgrade(grant_db):
    identifier = user(grant_db, 70)
    parameters = {"batch_key": "retained-audit", "amount": 100, "cutoff": CUTOFF}
    apply_credit_grant(grant_db, **parameters)
    with grant_db.begin() as connection:
        connection.execute(text("DELETE FROM users WHERE id=:id"), {"id": identifier})
    assert count(grant_db, "credit_grant_recipients") == 1
    assert apply_credit_grant(grant_db, **parameters)["total_granted"] == 100
    with pytest.raises(RuntimeError, match="Cannot remove the credit grant audit"):
        migrate(grant_db, "20260911_0005", downgrade=True)
    assert count(grant_db, "credit_grant_recipients") == 1


def test_empty_migration_roundtrip_preserves_existing_balances(grant_db):
    identifier = user(grant_db, 360)
    migrate(grant_db, "20260911_0005", downgrade=True)
    assert "credit_grant_batches" not in inspect(grant_db).get_table_names()
    assert balances(grant_db)[identifier] == 360
    migrate(grant_db, "head")
    assert count(grant_db, "credit_grant_batches") == 0
    assert balances(grant_db)[identifier] == 360


@pytest.mark.parametrize("change", [
    {"amount": 0}, {"amount": -1}, {"amount": True}, {"amount": 2_147_483_648},
    {"cutoff": CUTOFF.replace(tzinfo=None)}, {"batch_key": ""}, {"batch_key": "bad key"},
])
def test_invalid_parameters_are_rejected_before_database_access(change):
    parameters = {"batch_key": "valid", "amount": 100, "cutoff": CUTOFF, **change}
    for operation in (apply_credit_grant, preview_credit_grant):
        with pytest.raises(ValueError):
            operation(None, **parameters)
