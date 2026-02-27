"""add product categories

Revision ID: add_categories
Revises: add_geo_coords_to_sellers
Create Date: 2026-02-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_categories'
down_revision: Union[str, None] = 'add_geo_coords_to_sellers'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'categories',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('seller_id', sa.BigInteger(), sa.ForeignKey('users.tg_id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_categories_seller_id', 'categories', ['seller_id'])
    op.create_index('ix_categories_seller_active', 'categories', ['seller_id', 'is_active'])

    op.add_column('products', sa.Column('category_id', sa.Integer(), sa.ForeignKey('categories.id', ondelete='SET NULL'), nullable=True))
    op.create_index('ix_products_category_id', 'products', ['category_id'])


def downgrade() -> None:
    op.drop_index('ix_products_category_id', 'products')
    op.drop_column('products', 'category_id')
    op.drop_index('ix_categories_seller_active', 'categories')
    op.drop_index('ix_categories_seller_id', 'categories')
    op.drop_table('categories')
