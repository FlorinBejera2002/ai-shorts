"""Preserve optional brand styles and control their application.

Revision ID: 20260911_0005
Revises: 20260911_0003
Create Date: 2026-09-11
"""

from alembic import op

revision = "20260911_0005"
down_revision = "20260911_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE brand_kits ADD COLUMN apply_brand_colors boolean NOT NULL DEFAULT false;
    ALTER TABLE brand_kits ADD COLUMN apply_brand_font boolean NOT NULL DEFAULT false;
    UPDATE brand_kits
    SET apply_brand_colors = primary_color IS NOT NULL AND secondary_color IS NOT NULL,
        apply_brand_font = font_family IS NOT NULL;
    UPDATE brand_kits SET primary_color = '#6366f1' WHERE primary_color IS NULL;
    UPDATE brand_kits SET secondary_color = '#8b5cf6' WHERE secondary_color IS NULL;
    UPDATE brand_kits SET font_family = 'Inter' WHERE font_family IS NULL;
    ALTER TABLE brand_kits ALTER COLUMN primary_color SET DEFAULT '#6366f1';
    ALTER TABLE brand_kits ALTER COLUMN primary_color SET NOT NULL;
    ALTER TABLE brand_kits ALTER COLUMN secondary_color SET DEFAULT '#8b5cf6';
    ALTER TABLE brand_kits ALTER COLUMN secondary_color SET NOT NULL;
    ALTER TABLE brand_kits ALTER COLUMN font_family SET DEFAULT 'Inter';
    ALTER TABLE brand_kits ALTER COLUMN font_family SET NOT NULL;
    """)


def downgrade() -> None:
    op.execute("""
    ALTER TABLE brand_kits DROP COLUMN apply_brand_font;
    ALTER TABLE brand_kits DROP COLUMN apply_brand_colors;
    """)
