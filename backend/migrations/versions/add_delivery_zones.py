"""add delivery zones

Revision ID: add_delivery_zones
Revises: add_privacy_consent_fields
Create Date: 2026-02-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_delivery_zones'
down_revision: Union[str, None] = 'add_privacy_consent_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create delivery_zones table
    op.create_table(
        'delivery_zones',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('seller_id', sa.BigInteger(), sa.ForeignKey('sellers.seller_id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('district_ids', sa.JSON(), nullable=True),
        sa.Column('delivery_price', sa.DECIMAL(10, 2), server_default='0', nullable=False),
        sa.Column('min_order_amount', sa.DECIMAL(10, 2), nullable=True),
        sa.Column('free_delivery_from', sa.DECIMAL(10, 2), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('priority', sa.Integer(), server_default='0', nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_delivery_zones_seller_id', 'delivery_zones', ['seller_id'])
    op.create_index('ix_delivery_zones_seller_active', 'delivery_zones', ['seller_id', 'is_active'])

    # Add use_delivery_zones to sellers
    op.add_column('sellers', sa.Column('use_delivery_zones', sa.Boolean(), server_default='false', nullable=False))

    # Add delivery zone tracking to orders
    op.add_column('orders', sa.Column('delivery_zone_id', sa.Integer(), sa.ForeignKey('delivery_zones.id'), nullable=True))
    op.add_column('orders', sa.Column('delivery_fee', sa.DECIMAL(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'delivery_fee')
    op.drop_column('orders', 'delivery_zone_id')
    op.drop_column('sellers', 'use_delivery_zones')
    op.drop_index('ix_delivery_zones_seller_active', 'delivery_zones')
    op.drop_index('ix_delivery_zones_seller_id', 'delivery_zones')
    op.drop_table('delivery_zones')
