"""add payment fields to orders and yookassa_account_id to sellers

Revision ID: add_payment_fields
Revises: add_seller_commission
Create Date: 2026-02-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_payment_fields'
down_revision: Union[str, None] = 'add_seller_commission'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Payment fields on orders
    op.add_column('orders', sa.Column('payment_id', sa.String(255), nullable=True))
    op.add_column('orders', sa.Column('payment_status', sa.String(50), nullable=True))
    op.create_index('ix_orders_payment_id', 'orders', ['payment_id'])
    op.create_index('ix_orders_payment_status', 'orders', ['payment_status'])

    # YuKassa account ID for sellers (marketplace split payments)
    op.add_column('sellers', sa.Column('yookassa_account_id', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('sellers', 'yookassa_account_id')
    op.drop_index('ix_orders_payment_status', 'orders')
    op.drop_index('ix_orders_payment_id', 'orders')
    op.drop_column('orders', 'payment_status')
    op.drop_column('orders', 'payment_id')
