"""Add recipient fields and gift note to orders, gift_note_enabled to sellers

Revision ID: add_recipient_gift_note
Revises: add_fts_search
Create Date: 2026-03-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_recipient_gift_note'
down_revision: Union[str, None] = 'add_payment_method'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Recipient fields on orders ("Получатель не я")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(255)")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_phone VARCHAR(50)")
    # Gift note on orders ("Записка к цветам")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_note TEXT")
    # Seller toggle for gift notes
    op.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS gift_note_enabled BOOLEAN DEFAULT FALSE")


def downgrade() -> None:
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS recipient_name")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS recipient_phone")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS gift_note")
    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS gift_note_enabled")
