"""add referrals table

Revision ID: add_referrals_table
Revises: add_daily_limit_and_completed_at
Create Date: 2026-02-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_referrals_table'
down_revision: Union[str, None] = 'add_daily_limit_and_completed_at'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'referrals',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('referrer_id', sa.BigInteger(), nullable=False),
        sa.Column('referred_id', sa.BigInteger(), nullable=False),
        sa.Column('total_earned', sa.DECIMAL(10, 2), nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['referrer_id'], ['users.tg_id']),
        sa.ForeignKeyConstraint(['referred_id'], ['users.tg_id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('referred_id'),
    )
    op.create_index('ix_referrals_referrer_id', 'referrals', ['referrer_id'])


def downgrade() -> None:
    op.drop_index('ix_referrals_referrer_id', table_name='referrals')
    op.drop_table('referrals')
