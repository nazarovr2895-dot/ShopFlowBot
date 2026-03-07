"""Add page_views and daily_stats tables for analytics tracking

Revision ID: add_analytics
Revises: add_is_visible
Create Date: 2026-03-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_analytics'
down_revision: Union[str, None] = 'add_is_visible'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'page_views',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('visitor_id', sa.BigInteger(), nullable=True),
        sa.Column('session_id', sa.String(64), nullable=False),
        sa.Column('event_type', sa.String(20), nullable=False),
        sa.Column('seller_id', sa.BigInteger(), nullable=True),
        sa.Column('product_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_page_views_created_at', 'page_views', ['created_at'])
    op.create_index('ix_page_views_event_created', 'page_views', ['event_type', 'created_at'])
    op.create_index('ix_page_views_seller_created', 'page_views', ['seller_id', 'created_at'])
    op.create_index('ix_page_views_product_created', 'page_views', ['product_id', 'created_at'])

    op.create_table(
        'daily_stats',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('seller_id', sa.BigInteger(), nullable=True),
        sa.Column('unique_visitors', sa.Integer(), server_default='0'),
        sa.Column('total_views', sa.Integer(), server_default='0'),
        sa.Column('shop_views', sa.Integer(), server_default='0'),
        sa.Column('product_views', sa.Integer(), server_default='0'),
        sa.Column('orders_placed', sa.Integer(), server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('date', 'seller_id', name='uq_daily_stats_date_seller'),
    )
    op.create_index('ix_daily_stats_date', 'daily_stats', ['date'])
    op.create_index('ix_daily_stats_seller_date', 'daily_stats', ['seller_id', 'date'])


def downgrade() -> None:
    op.drop_index('ix_daily_stats_seller_date', table_name='daily_stats')
    op.drop_index('ix_daily_stats_date', table_name='daily_stats')
    op.drop_table('daily_stats')
    op.drop_index('ix_page_views_product_created', table_name='page_views')
    op.drop_index('ix_page_views_seller_created', table_name='page_views')
    op.drop_index('ix_page_views_event_created', table_name='page_views')
    op.drop_index('ix_page_views_created_at', table_name='page_views')
    op.drop_table('page_views')
