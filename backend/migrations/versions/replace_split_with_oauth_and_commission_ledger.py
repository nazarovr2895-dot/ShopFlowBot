"""Replace split payments with OAuth Partner API + commission ledger

- Remove yookassa_account_id from sellers
- Add yookassa_oauth_token, yookassa_shop_id, yookassa_connected_at
- Add commission_balance, grace_period_until
- Create commission_ledger table

Revision ID: oauth_commission_ledger
Revises: add_logo_url
Create Date: 2026-03-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'oauth_commission_ledger'
down_revision: Union[str, None] = 'add_logo_url'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- sellers: remove old split field, add OAuth + commission fields ---
    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS yookassa_account_id")
    op.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS yookassa_oauth_token VARCHAR(512)")
    op.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS yookassa_shop_id VARCHAR(64)")
    op.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS yookassa_connected_at TIMESTAMP")
    op.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS commission_balance DECIMAL(10,2) DEFAULT 0")
    op.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS grace_period_until TIMESTAMP")

    # --- commission_ledger table ---
    op.create_table(
        'commission_ledger',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('seller_id', sa.BigInteger(), sa.ForeignKey('sellers.seller_id'), nullable=False),
        sa.Column('order_id', sa.Integer(), sa.ForeignKey('orders.id'), nullable=False),
        sa.Column('order_total', sa.DECIMAL(10, 2), nullable=False),
        sa.Column('commission_rate', sa.DECIMAL(5, 2), nullable=False),
        sa.Column('commission_amount', sa.DECIMAL(10, 2), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('paid', sa.Boolean(), server_default=sa.text('false')),
        sa.Column('paid_at', sa.DateTime(), nullable=True),
        sa.Column('subscription_payment_id', sa.String(255), nullable=True),
    )
    op.create_index('ix_commission_ledger_seller_id', 'commission_ledger', ['seller_id'])
    op.create_index('ix_commission_ledger_paid', 'commission_ledger', ['paid'])
    op.create_index('ix_commission_ledger_seller_paid', 'commission_ledger', ['seller_id', 'paid'])


def downgrade() -> None:
    op.drop_index('ix_commission_ledger_seller_paid', 'commission_ledger')
    op.drop_index('ix_commission_ledger_paid', 'commission_ledger')
    op.drop_index('ix_commission_ledger_seller_id', 'commission_ledger')
    op.drop_table('commission_ledger')

    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS grace_period_until")
    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS commission_balance")
    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS yookassa_connected_at")
    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS yookassa_shop_id")
    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS yookassa_oauth_token")
    op.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS yookassa_account_id VARCHAR(255)")
