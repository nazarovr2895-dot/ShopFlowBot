"""Add logo_url to sellers

Revision ID: add_logo_url
Revises: add_recipient_gift_note
Create Date: 2026-03-02

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'add_logo_url'
down_revision: Union[str, None] = 'add_recipient_gift_note'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS logo_url VARCHAR(512)")


def downgrade() -> None:
    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS logo_url")
