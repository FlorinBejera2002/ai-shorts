"""Complete the brand settings schema consumed by frontend and backend."""

import sqlalchemy as sa
from alembic import op

revision = "20260904_0001"
down_revision = "20260903_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "brand_kits",
        sa.Column(
            "hide_platform_badge",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("brand_kits", "hide_platform_badge")
