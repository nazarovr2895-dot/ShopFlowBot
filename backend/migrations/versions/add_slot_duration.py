"""add slot_duration_minutes to sellers

Revision ID: add_slot_duration
Revises: add_delivery_slots
Create Date: 2026-02-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_slot_duration'
down_revision: Union[str, None] = 'add_delivery_slots'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sellers', sa.Column('slot_duration_minutes', sa.Integer(), server_default='120', nullable=False))


def downgrade() -> None:
    op.drop_column('sellers', 'slot_duration_minutes')
