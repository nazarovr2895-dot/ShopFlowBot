"""Add contact_phone and contact_username to sellers

Revision ID: add_contact_phone_username
Revises: add_recipient_gift_note
Create Date: 2026-03-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_contact_phone_username'
down_revision: Union[str, None] = 'oauth_commission_ledger'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(20)")
    op.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS contact_username VARCHAR(64)")


def downgrade() -> None:
    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS contact_phone")
    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS contact_username")
