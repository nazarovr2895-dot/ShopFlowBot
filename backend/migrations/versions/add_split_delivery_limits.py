"""add split delivery limits

Revision ID: add_split_delivery_limits
Revises: add_subscriptions_table
Create Date: 2026-02-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_split_delivery_limits'
down_revision: Union[str, None] = 'add_subscriptions_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sellers', sa.Column('max_delivery_orders', sa.Integer(), server_default='10', nullable=False))
    op.add_column('sellers', sa.Column('max_pickup_orders', sa.Integer(), server_default='20', nullable=False))
    op.add_column('sellers', sa.Column('active_delivery_orders', sa.Integer(), server_default='0', nullable=False))
    op.add_column('sellers', sa.Column('active_pickup_orders', sa.Integer(), server_default='0', nullable=False))
    op.add_column('sellers', sa.Column('pending_delivery_requests', sa.Integer(), server_default='0', nullable=False))
    op.add_column('sellers', sa.Column('pending_pickup_requests', sa.Integer(), server_default='0', nullable=False))

    # Backfill per-type counters from actual order data
    op.execute("""
        UPDATE sellers s SET
            active_delivery_orders = COALESCE((
                SELECT COUNT(*) FROM orders o
                WHERE o.seller_id = s.seller_id
                AND o.status IN ('accepted', 'assembling', 'in_transit')
                AND LOWER(COALESCE(o.delivery_type, '')) IN ('доставка', 'delivery')
            ), 0),
            active_pickup_orders = COALESCE((
                SELECT COUNT(*) FROM orders o
                WHERE o.seller_id = s.seller_id
                AND o.status IN ('accepted', 'assembling', 'in_transit')
                AND LOWER(COALESCE(o.delivery_type, '')) IN ('самовывоз', 'pickup')
            ), 0),
            pending_delivery_requests = COALESCE((
                SELECT COUNT(*) FROM orders o
                WHERE o.seller_id = s.seller_id
                AND o.status = 'pending'
                AND LOWER(COALESCE(o.delivery_type, '')) IN ('доставка', 'delivery')
            ), 0),
            pending_pickup_requests = COALESCE((
                SELECT COUNT(*) FROM orders o
                WHERE o.seller_id = s.seller_id
                AND o.status = 'pending'
                AND LOWER(COALESCE(o.delivery_type, '')) IN ('самовывоз', 'pickup')
            ), 0)
    """)


def downgrade() -> None:
    op.drop_column('sellers', 'pending_pickup_requests')
    op.drop_column('sellers', 'pending_delivery_requests')
    op.drop_column('sellers', 'active_pickup_orders')
    op.drop_column('sellers', 'active_delivery_orders')
    op.drop_column('sellers', 'max_pickup_orders')
    op.drop_column('sellers', 'max_delivery_orders')
