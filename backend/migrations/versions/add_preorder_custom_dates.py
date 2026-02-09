"""add preorder_custom_dates to sellers

Revision ID: add_preorder_custom_dates
Revises: add_preorder_fields
Create Date: 2026-02-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_preorder_custom_dates'
down_revision: Union[str, None] = 'add_preorder_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sellers', sa.Column('preorder_custom_dates', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('sellers', 'preorder_custom_dates')
