"""add preorder fields to products, orders, sellers, cart_items

Revision ID: add_preorder_fields
Revises: add_reception_status
Create Date: 2026-02-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_preorder_fields'
down_revision: Union[str, None] = 'add_reception_status'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('products', sa.Column('is_preorder', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('orders', sa.Column('is_preorder', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('orders', sa.Column('preorder_delivery_date', sa.Date(), nullable=True))
    op.add_column('sellers', sa.Column('preorder_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('sellers', sa.Column('preorder_schedule_type', sa.String(50), nullable=True))
    op.add_column('sellers', sa.Column('preorder_weekday', sa.Integer(), nullable=True))
    op.add_column('sellers', sa.Column('preorder_interval_days', sa.Integer(), nullable=True))
    op.add_column('sellers', sa.Column('preorder_base_date', sa.Date(), nullable=True))
    op.add_column('cart_items', sa.Column('is_preorder', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('cart_items', sa.Column('preorder_delivery_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('cart_items', 'preorder_delivery_date')
    op.drop_column('cart_items', 'is_preorder')
    op.drop_column('sellers', 'preorder_base_date')
    op.drop_column('sellers', 'preorder_interval_days')
    op.drop_column('sellers', 'preorder_weekday')
    op.drop_column('sellers', 'preorder_schedule_type')
    op.drop_column('sellers', 'preorder_enabled')
    op.drop_column('orders', 'preorder_delivery_date')
    op.drop_column('orders', 'is_preorder')
    op.drop_column('products', 'is_preorder')
