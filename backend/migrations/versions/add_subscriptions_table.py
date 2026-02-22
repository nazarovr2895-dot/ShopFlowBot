"""add subscriptions table

Revision ID: add_subscriptions_table
Revises: add_payment_fields
Create Date: 2026-02-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_subscriptions_table'
down_revision: Union[str, None] = 'add_payment_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'subscriptions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('seller_id', sa.BigInteger(), nullable=False),
        sa.Column('period_months', sa.Integer(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('payment_id', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=20), server_default='pending', nullable=False),
        sa.Column('amount_paid', sa.DECIMAL(precision=10, scale=2), server_default='0', nullable=False),
        sa.Column('auto_renew', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['seller_id'], ['users.tg_id'], name='fk_subscriptions_seller_id'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_index('ix_subscriptions_seller_id', 'subscriptions', ['seller_id'])
    op.create_index('ix_subscriptions_status', 'subscriptions', ['status'])
    op.create_index('ix_subscriptions_expires_at', 'subscriptions', ['expires_at'])

    # Activate existing sellers so they are not locked out
    op.execute(
        "UPDATE sellers SET subscription_plan = 'active'"
        " WHERE subscription_plan IN ('free', 'pro', 'premium')"
        " AND deleted_at IS NULL"
    )


def downgrade() -> None:
    # Restore old plan values for sellers that were migrated
    op.execute(
        "UPDATE sellers SET subscription_plan = 'free'"
        " WHERE subscription_plan = 'active'"
    )

    op.drop_index('ix_subscriptions_expires_at', table_name='subscriptions')
    op.drop_index('ix_subscriptions_status', table_name='subscriptions')
    op.drop_index('ix_subscriptions_seller_id', table_name='subscriptions')
    op.drop_table('subscriptions')
