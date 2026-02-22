"""add privacy consent fields to users

Revision ID: add_privacy_consent_fields
Revises: add_split_delivery_limits
Create Date: 2026-02-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_privacy_consent_fields'
down_revision: Union[str, None] = 'add_split_delivery_limits'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('privacy_accepted', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('users', sa.Column('privacy_accepted_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'privacy_accepted_at')
    op.drop_column('users', 'privacy_accepted')
