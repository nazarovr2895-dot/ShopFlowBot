"""add inn to sellers

Revision ID: add_inn_to_sellers
Revises: add_preorder_custom_dates
Create Date: 2026-02-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_inn_to_sellers'
down_revision: Union[str, None] = 'add_seller_counters'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sellers', sa.Column('inn', sa.String(12), nullable=True))
    op.create_index('ix_sellers_inn', 'sellers', ['inn'])


def downgrade() -> None:
    op.drop_index('ix_sellers_inn', table_name='sellers')
    op.drop_column('sellers', 'inn')
