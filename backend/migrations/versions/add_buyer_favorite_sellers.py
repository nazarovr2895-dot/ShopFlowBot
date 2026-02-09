"""add buyer_favorite_sellers table

Revision ID: add_favorite_sellers
Revises: add_loyalty_customers
Create Date: 2026-02-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_favorite_sellers'
down_revision: Union[str, None] = 'add_loyalty_customers'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'buyer_favorite_sellers',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('buyer_id', sa.BigInteger(), nullable=False),
        sa.Column('seller_id', sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(['buyer_id'], ['users.tg_id']),
        sa.ForeignKeyConstraint(['seller_id'], ['users.tg_id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('buyer_id', 'seller_id', name='uq_favorite_buyer_seller'),
    )
    op.create_index('ix_favorite_buyer_seller', 'buyer_favorite_sellers', ['buyer_id', 'seller_id'])


def downgrade() -> None:
    op.drop_index('ix_favorite_buyer_seller', table_name='buyer_favorite_sellers')
    op.drop_table('buyer_favorite_sellers')
