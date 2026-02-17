"""P0: add missing columns and tables not covered by previous migration

Previous migration p1_tiers_expiry_tags was applied with incomplete content
(only P1 fields). This migration adds the remaining P0 changes:
- sellers: max_points_discount_percent, points_to_ruble_rate
- orders: points_used, points_discount
- seller_customers: birthday
- NEW TABLE: customer_events
- NEW TABLE: write_offs

Revision ID: p0_missing_columns_tables
Revises: p1_tiers_expiry_tags
Create Date: 2026-02-17 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'p0_missing_columns_tables'
down_revision: Union[str, None] = 'p1_tiers_expiry_tags'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ============================================================
    # 1. sellers: missing P0 columns
    # ============================================================
    op.add_column('sellers', sa.Column('max_points_discount_percent', sa.Integer(), nullable=True, server_default='100'))
    op.add_column('sellers', sa.Column('points_to_ruble_rate', sa.DECIMAL(5, 2), nullable=True, server_default='1'))

    # ============================================================
    # 2. orders: points payment columns
    # ============================================================
    op.add_column('orders', sa.Column('points_used', sa.DECIMAL(12, 2), nullable=True, server_default='0'))
    op.add_column('orders', sa.Column('points_discount', sa.DECIMAL(10, 2), nullable=True, server_default='0'))

    # ============================================================
    # 3. seller_customers: birthday
    # ============================================================
    op.add_column('seller_customers', sa.Column('birthday', sa.Date(), nullable=True))

    # ============================================================
    # 4. NEW TABLE: customer_events
    # ============================================================
    op.create_table(
        'customer_events',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('customer_id', sa.Integer(), sa.ForeignKey('seller_customers.id'), nullable=False),
        sa.Column('seller_id', sa.BigInteger(), sa.ForeignKey('users.tg_id'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('event_date', sa.Date(), nullable=False),
        sa.Column('remind_days_before', sa.Integer(), server_default='3'),
        sa.Column('notes', sa.Text(), nullable=True),
    )
    op.create_index('ix_customer_events_customer_id', 'customer_events', ['customer_id'])
    op.create_index('ix_customer_events_seller_id', 'customer_events', ['seller_id'])

    # ============================================================
    # 5. NEW TABLE: write_offs
    # ============================================================
    op.create_table(
        'write_offs',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('seller_id', sa.BigInteger(), sa.ForeignKey('users.tg_id'), nullable=False),
        sa.Column('reception_item_id', sa.Integer(), sa.ForeignKey('reception_items.id'), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('reason', sa.String(50), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('loss_amount', sa.DECIMAL(12, 2), server_default='0'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
    )
    op.create_index('ix_write_offs_seller_id', 'write_offs', ['seller_id'])
    op.create_index('ix_write_offs_created_at', 'write_offs', ['created_at'])


def downgrade() -> None:
    # --- write_offs ---
    op.drop_index('ix_write_offs_created_at', table_name='write_offs')
    op.drop_index('ix_write_offs_seller_id', table_name='write_offs')
    op.drop_table('write_offs')

    # --- customer_events ---
    op.drop_index('ix_customer_events_seller_id', table_name='customer_events')
    op.drop_index('ix_customer_events_customer_id', table_name='customer_events')
    op.drop_table('customer_events')

    # --- seller_customers ---
    op.drop_column('seller_customers', 'birthday')

    # --- orders ---
    op.drop_column('orders', 'points_discount')
    op.drop_column('orders', 'points_used')

    # --- sellers ---
    op.drop_column('sellers', 'points_to_ruble_rate')
    op.drop_column('sellers', 'max_points_discount_percent')
