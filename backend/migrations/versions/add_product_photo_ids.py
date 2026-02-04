"""add product photo_ids (up to 3 photos per product)

Revision ID: add_photo_ids
Revises: add_cart_visited
Create Date: 2026-02-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_photo_ids'
down_revision: Union[str, None] = 'add_cart_visited'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('products', sa.Column('photo_ids', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('products', 'photo_ids')
