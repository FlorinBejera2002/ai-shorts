"""Atomic, additive administrative bonuses with a durable idempotency ledger."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine


def _parameters(batch_key: str, amount: int, cutoff: datetime) -> dict:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", batch_key):
        raise ValueError("batch_key must contain 1–128 letters, digits, dots, colons, dashes or underscores")
    if type(amount) is not int or not 0 < amount <= 2_147_483_647:
        raise ValueError("amount must be a positive PostgreSQL integer")
    if cutoff.tzinfo is None or cutoff.utcoffset() is None:
        raise ValueError("cutoff must include a timezone")
    return {"batch_key": batch_key, "amount": amount,
            "cutoff": cutoff.astimezone(timezone.utc)}


def _validate_existing(batch, parameters: dict) -> None:
    if batch and (batch["amount"] != parameters["amount"] or batch["cutoff"] != parameters["cutoff"]):
        raise ValueError("This batch_key was already used with a different amount or cutoff")


def _report(connection: Connection, parameters: dict, status: str) -> dict:
    if status == "preview":
        row = connection.execute(text("""
            SELECT count(*) AS recipients, coalesce(sum(credits), 0) AS balance_before
            FROM users WHERE created_at <= :cutoff
        """), parameters).mappings().one()
    else:
        row = connection.execute(text("""
            SELECT count(*) AS recipients, coalesce(sum(balance_before), 0) AS balance_before
            FROM credit_grant_recipients WHERE batch_key = :batch_key
        """), parameters).mappings().one()
    recipients = int(row["recipients"])
    total = recipients * parameters["amount"]
    return {
        "status": status, "batch_key": parameters["batch_key"],
        "amount_per_user": parameters["amount"], "cutoff": parameters["cutoff"].isoformat(),
        "recipients": recipients, "total_granted": total,
        "balance_total_before": int(row["balance_before"]),
        "balance_total_after": int(row["balance_before"]) + total,
    }


def preview_credit_grant(engine: Engine, *, batch_key: str, amount: int, cutoff: datetime) -> dict:
    """Read eligible totals; no balance or audit rows are written."""
    parameters = _parameters(batch_key, amount, cutoff)
    with engine.connect() as connection:
        batch = connection.execute(text("""
            SELECT amount, cutoff, completed_at FROM credit_grant_batches
            WHERE batch_key = :batch_key
        """), parameters).mappings().one_or_none()
        _validate_existing(batch, parameters)
        status = "already_applied" if batch and batch["completed_at"] else "preview"
        return _report(connection, parameters, status)


def apply_credit_grant(engine: Engine, *, batch_key: str, amount: int, cutoff: datetime) -> dict:
    """Apply once per batch, preserving balances and all concurrent account changes."""
    parameters = _parameters(batch_key, amount, cutoff)
    with engine.begin() as connection:
        # The unique insert waits for any concurrent execution of this same
        # batch. Its balance increments, audit and completion commit together.
        connection.execute(text("""
            INSERT INTO credit_grant_batches (batch_key, amount, cutoff)
            VALUES (:batch_key, :amount, :cutoff)
            ON CONFLICT (batch_key) DO NOTHING
        """), parameters)
        batch = connection.execute(text("""
            SELECT amount, cutoff, completed_at FROM credit_grant_batches
            WHERE batch_key = :batch_key FOR UPDATE
        """), parameters).mappings().one()
        _validate_existing(batch, parameters)
        if batch["completed_at"]:
            return _report(connection, parameters, "already_applied")
        connection.execute(text("""
            WITH eligible AS MATERIALIZED (
                SELECT id FROM users WHERE created_at <= :cutoff
                ORDER BY id FOR UPDATE
            ), credited AS (
                UPDATE users AS u
                SET credits = u.credits + :amount, updated_at = now()
                FROM eligible WHERE u.id = eligible.id
                RETURNING u.id, u.credits - :amount AS balance_before,
                          u.credits AS balance_after
            )
            INSERT INTO credit_grant_recipients
                (batch_key, user_id, balance_before, balance_after)
            SELECT :batch_key, id, balance_before, balance_after FROM credited
        """), parameters)
        connection.execute(text("""
            UPDATE credit_grant_batches SET completed_at = now()
            WHERE batch_key = :batch_key
        """), parameters)
        return _report(connection, parameters, "applied")
