"""Add is_visible toggle to sellers

Revision ID: add_is_visible
Revises: add_social_about
Create Date: 2026-03-06

"""
from typing import Sequence, Union

from alembic import op


revision: str = "add_is_visible"
down_revision: Union[str, None] = "add_social_about"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT TRUE NOT NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS is_visible")
