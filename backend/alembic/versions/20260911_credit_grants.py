"""Audit one-time administrative credit grants.

Revision ID: 20260911_0006
Revises: 20260911_0005
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260911_0006"
down_revision = "20260911_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "credit_grant_batches",
        sa.Column("batch_key", sa.String(128), primary_key=True),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("cutoff", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("amount > 0", name="ck_credit_grant_batches_positive_amount"),
    )
    op.create_table(
        "credit_grant_recipients",
        sa.Column("batch_key", sa.String(128),
                  sa.ForeignKey("credit_grant_batches.batch_key"), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("balance_before", sa.Integer(), nullable=False),
        sa.Column("balance_after", sa.Integer(), nullable=False),
        sa.CheckConstraint("balance_after > balance_before",
                           name="ck_credit_grant_recipients_positive_delta"),
    )


def downgrade() -> None:
    # Removing an applied ledger would make the same batch eligible for a second
    # grant. An empty migration can be reversed; applied audit data is retained.
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT EXISTS(SELECT 1 FROM credit_grant_batches)")).scalar():
        raise RuntimeError("Cannot remove the credit grant audit after a batch was recorded")
    op.drop_table("credit_grant_recipients")
    op.drop_table("credit_grant_batches")
