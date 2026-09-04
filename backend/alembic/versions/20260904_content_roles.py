"""Server-controlled content roles; self-service cannot grant privileges."""

import sqlalchemy as sa
from alembic import op

revision = "20260904_0004"
down_revision = "20260904_0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column(
            "access_role", sa.String(20), nullable=False, server_default="member"
        ),
    )
    op.create_check_constraint(
        "ck_users_access_role", "users", "access_role IN ('member', 'viewer')"
    )


def downgrade():
    op.drop_constraint("ck_users_access_role", "users", type_="check")
    op.drop_column("users", "access_role")
