"""Add social links and about us fields to sellers

Revision ID: add_social_about
Revises: add_is_addon_categories
Create Date: 2026-03-05

"""
from typing import Sequence, Union

from alembic import op


revision: str = "add_social_about"
down_revision: Union[str, None] = "add_is_addon_categories"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS social_links_enabled BOOLEAN DEFAULT FALSE")
    op.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS social_links JSON")
    op.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS about_enabled BOOLEAN DEFAULT FALSE")
    op.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS about_content JSON")
    op.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS about_background JSON")


def downgrade() -> None:
    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS about_background")
    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS about_content")
    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS about_enabled")
    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS social_links")
    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS social_links_enabled")
