"""add buyer_favorite_products table

Revision ID: add_favorite_products
Revises: add_favorite_sellers
Create Date: 2026-02-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_favorite_products'
down_revision: Union[str, None] = 'add_favorite_sellers'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'buyer_favorite_products',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('buyer_id', sa.BigInteger(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['buyer_id'], ['users.tg_id']),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('buyer_id', 'product_id', name='uq_favorite_buyer_product'),
    )
    op.create_index('ix_favorite_buyer_product', 'buyer_favorite_products', ['buyer_id', 'product_id'])


def downgrade() -> None:
    op.drop_index('ix_favorite_buyer_product', table_name='buyer_favorite_products')
    op.drop_table('buyer_favorite_products')
