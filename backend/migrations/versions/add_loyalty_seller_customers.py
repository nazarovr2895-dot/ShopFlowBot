"""add loyalty: seller_customers, seller_loyalty_transactions, loyalty_points_percent on sellers

Revision ID: add_loyalty_customers
Revises: add_hashtags_sellers
Create Date: 2026-02-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_loyalty_customers'
down_revision: Union[str, None] = 'add_hashtags_sellers'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sellers', sa.Column('loyalty_points_percent', sa.DECIMAL(5, 2), server_default='0', nullable=False))

    op.create_table(
        'seller_customers',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('seller_id', sa.BigInteger(), nullable=False),
        sa.Column('phone', sa.String(20), nullable=False),
        sa.Column('first_name', sa.String(255), nullable=False),
        sa.Column('last_name', sa.String(255), nullable=False),
        sa.Column('card_number', sa.String(32), nullable=False),
        sa.Column('points_balance', sa.DECIMAL(12, 2), server_default='0', nullable=False),
        sa.Column('linked_user_id', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['linked_user_id'], ['users.tg_id'], ),
        sa.ForeignKeyConstraint(['seller_id'], ['users.tg_id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('seller_id', 'phone', name='uq_seller_customers_seller_phone'),
    )
    op.create_index('ix_seller_customers_seller_id', 'seller_customers', ['seller_id'], unique=False)
    op.create_index('ix_seller_customers_phone', 'seller_customers', ['phone'], unique=False)
    op.create_index('ix_seller_customers_card', 'seller_customers', ['seller_id', 'card_number'], unique=False)

    op.create_table(
        'seller_loyalty_transactions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('seller_id', sa.BigInteger(), nullable=False),
        sa.Column('customer_id', sa.Integer(), nullable=False),
        sa.Column('order_id', sa.Integer(), nullable=True),
        sa.Column('amount', sa.DECIMAL(12, 2), nullable=False),
        sa.Column('points_accrued', sa.DECIMAL(12, 2), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['customer_id'], ['seller_customers.id'], ),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ),
        sa.ForeignKeyConstraint(['seller_id'], ['users.tg_id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_seller_loyalty_tx_seller_id', 'seller_loyalty_transactions', ['seller_id'], unique=False)
    op.create_index('ix_seller_loyalty_tx_customer_id', 'seller_loyalty_transactions', ['customer_id'], unique=False)
    op.create_index('ix_seller_loyalty_tx_created_at', 'seller_loyalty_transactions', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_seller_loyalty_tx_created_at', table_name='seller_loyalty_transactions')
    op.drop_index('ix_seller_loyalty_tx_customer_id', table_name='seller_loyalty_transactions')
    op.drop_index('ix_seller_loyalty_tx_seller_id', table_name='seller_loyalty_transactions')
    op.drop_table('seller_loyalty_transactions')
    op.drop_index('ix_seller_customers_card', table_name='seller_customers')
    op.drop_index('ix_seller_customers_phone', table_name='seller_customers')
    op.drop_index('ix_seller_customers_seller_id', table_name='seller_customers')
    op.drop_table('seller_customers')
    op.drop_column('sellers', 'loyalty_points_percent')
