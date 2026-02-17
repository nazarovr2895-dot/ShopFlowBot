"""P0+P1: all new columns, tables, and tags migration

Covers ALL schema changes from P0 and P1 phases:
- sellers: max_points_discount_percent, points_to_ruble_rate, loyalty_tiers_config, points_expire_days
- orders: points_used, points_discount
- seller_customers: birthday, tags Text->JSON
- seller_loyalty_transactions: expires_at, is_expired
- NEW TABLE: customer_events
- NEW TABLE: write_offs

Revision ID: p1_tiers_expiry_tags
Revises: add_ogrn_to_sellers
Create Date: 2026-02-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'p1_tiers_expiry_tags'
down_revision: Union[str, None] = 'add_ogrn_to_sellers'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ============================================================
    # 1. sellers table: P0 fields (points payment) + P1 fields (tiers, expiry)
    # ============================================================
    op.add_column('sellers', sa.Column('max_points_discount_percent', sa.Integer(), nullable=True, server_default='100'))
    op.add_column('sellers', sa.Column('points_to_ruble_rate', sa.DECIMAL(5, 2), nullable=True, server_default='1'))
    op.add_column('sellers', sa.Column('loyalty_tiers_config', sa.JSON(), nullable=True))
    op.add_column('sellers', sa.Column('points_expire_days', sa.Integer(), nullable=True))

    # ============================================================
    # 2. orders table: P0 fields (points used at checkout)
    # ============================================================
    op.add_column('orders', sa.Column('points_used', sa.DECIMAL(12, 2), nullable=True, server_default='0'))
    op.add_column('orders', sa.Column('points_discount', sa.DECIMAL(10, 2), nullable=True, server_default='0'))

    # ============================================================
    # 3. seller_customers: P0 birthday + P1 tags Text -> JSON
    # ============================================================
    op.add_column('seller_customers', sa.Column('birthday', sa.Date(), nullable=True))

    # Convert existing text tags to JSON arrays, then alter column type
    op.execute("""
        UPDATE seller_customers
        SET tags = NULL
        WHERE tags IS NOT NULL AND tags = ''
    """)
    op.execute("""
        UPDATE seller_customers
        SET tags = (
            SELECT jsonb_agg(trim(elem))
            FROM unnest(string_to_array(tags::text, ',')) AS elem
            WHERE trim(elem) != ''
        )::text
        WHERE tags IS NOT NULL AND tags != ''
    """)
    op.alter_column('seller_customers', 'tags',
                     type_=sa.JSON(),
                     existing_type=sa.Text(),
                     postgresql_using='tags::json',
                     nullable=True)

    # ============================================================
    # 4. seller_loyalty_transactions: P1 expiry fields
    # ============================================================
    op.add_column('seller_loyalty_transactions', sa.Column('expires_at', sa.DateTime(), nullable=True))
    op.add_column('seller_loyalty_transactions', sa.Column('is_expired', sa.Boolean(), server_default='false', nullable=False))
    op.create_index('ix_seller_loyalty_tx_expires_at', 'seller_loyalty_transactions', ['expires_at'])

    # ============================================================
    # 5. NEW TABLE: customer_events (P0 — significant dates)
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
    # 6. NEW TABLE: write_offs (P0 — quick flower disposal)
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

    # --- seller_loyalty_transactions ---
    op.drop_index('ix_seller_loyalty_tx_expires_at', table_name='seller_loyalty_transactions')
    op.drop_column('seller_loyalty_transactions', 'is_expired')
    op.drop_column('seller_loyalty_transactions', 'expires_at')

    # --- seller_customers.tags: JSON -> Text ---
    op.alter_column('seller_customers', 'tags',
                     type_=sa.Text(),
                     existing_type=sa.JSON(),
                     postgresql_using="tags::text",
                     nullable=True)
    op.drop_column('seller_customers', 'birthday')

    # --- orders ---
    op.drop_column('orders', 'points_discount')
    op.drop_column('orders', 'points_used')

    # --- sellers ---
    op.drop_column('sellers', 'points_expire_days')
    op.drop_column('sellers', 'loyalty_tiers_config')
    op.drop_column('sellers', 'points_to_ruble_rate')
    op.drop_column('sellers', 'max_points_discount_percent')
