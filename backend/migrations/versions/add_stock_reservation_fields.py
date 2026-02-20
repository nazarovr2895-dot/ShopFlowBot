"""add stock reservation fields

Add reserved_quantity to products and reserved_at to cart_items
for the 5-minute stock reservation system.

Revision ID: add_stock_reservation
Revises: add_product_composition
Create Date: 2026-02-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_stock_reservation'
down_revision: Union[str, None] = 'add_product_composition'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('products', sa.Column('reserved_quantity', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('cart_items', sa.Column('reserved_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('cart_items', 'reserved_at')
    op.drop_column('products', 'reserved_quantity')
