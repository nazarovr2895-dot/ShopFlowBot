"""add cart_items and buyer_visited_sellers tables

Revision ID: add_cart_visited
Revises: add_crm_flowers_receptions_v1
Create Date: 2026-02-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_cart_visited'
down_revision: Union[str, None] = 'add_crm_flowers_receptions_v1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'cart_items',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('buyer_id', sa.BigInteger(), nullable=False),
        sa.Column('seller_id', sa.BigInteger(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('quantity', sa.Integer(), server_default='1'),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('price', sa.DECIMAL(10, 2), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['buyer_id'], ['users.tg_id']),
        sa.ForeignKeyConstraint(['seller_id'], ['users.tg_id']),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('buyer_id', 'seller_id', 'product_id', name='uq_cart_buyer_seller_product'),
    )
    op.create_index('ix_cart_items_buyer_id', 'cart_items', ['buyer_id'])

    op.create_table(
        'buyer_visited_sellers',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('buyer_id', sa.BigInteger(), nullable=False),
        sa.Column('seller_id', sa.BigInteger(), nullable=False),
        sa.Column('visited_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['buyer_id'], ['users.tg_id']),
        sa.ForeignKeyConstraint(['seller_id'], ['users.tg_id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('buyer_id', 'seller_id', name='uq_visited_buyer_seller'),
    )
    op.create_index('ix_visited_buyer_visited_at', 'buyer_visited_sellers', ['buyer_id', 'visited_at'])


def downgrade() -> None:
    op.drop_index('ix_visited_buyer_visited_at', table_name='buyer_visited_sellers')
    op.drop_table('buyer_visited_sellers')
    op.drop_index('ix_cart_items_buyer_id', table_name='cart_items')
    op.drop_table('cart_items')
