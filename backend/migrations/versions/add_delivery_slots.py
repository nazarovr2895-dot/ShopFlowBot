"""add delivery slots

Revision ID: add_delivery_slots
Revises: remove_moscow_okrugs
Create Date: 2026-02-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_delivery_slots'
down_revision: Union[str, None] = 'remove_moscow_okrugs'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Seller: delivery slot settings
    op.add_column('sellers', sa.Column('deliveries_per_slot', sa.Integer(), nullable=True))
    op.add_column('sellers', sa.Column('slot_days_ahead', sa.Integer(), server_default='3', nullable=False))
    op.add_column('sellers', sa.Column('min_slot_lead_minutes', sa.Integer(), server_default='120', nullable=False))

    # Order: delivery slot tracking
    op.add_column('orders', sa.Column('delivery_slot_date', sa.Date(), nullable=True))
    op.add_column('orders', sa.Column('delivery_slot_start', sa.String(5), nullable=True))
    op.add_column('orders', sa.Column('delivery_slot_end', sa.String(5), nullable=True))

    # Composite index for fast slot availability queries
    op.create_index(
        'ix_orders_slot_lookup',
        'orders',
        ['seller_id', 'delivery_slot_date', 'delivery_slot_start', 'status'],
    )


def downgrade() -> None:
    op.drop_index('ix_orders_slot_lookup', table_name='orders')
    op.drop_column('orders', 'delivery_slot_end')
    op.drop_column('orders', 'delivery_slot_start')
    op.drop_column('orders', 'delivery_slot_date')
    op.drop_column('sellers', 'min_slot_lead_minutes')
    op.drop_column('sellers', 'slot_days_ahead')
    op.drop_column('sellers', 'deliveries_per_slot')
