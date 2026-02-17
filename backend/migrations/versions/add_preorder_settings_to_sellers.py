"""add preorder_min_lead_days, preorder_max_per_date, preorder_discount fields to sellers

Revision ID: add_preorder_settings
Revises: fix_cart_uq_preorder_date
Create Date: 2026-02-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_preorder_settings'
down_revision: Union[str, None] = 'fix_cart_uq_preorder_date'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sellers', sa.Column('preorder_min_lead_days', sa.Integer(), server_default='2', nullable=False))
    op.add_column('sellers', sa.Column('preorder_max_per_date', sa.Integer(), nullable=True))
    op.add_column('sellers', sa.Column('preorder_discount_percent', sa.DECIMAL(5, 2), server_default='0', nullable=False))
    op.add_column('sellers', sa.Column('preorder_discount_min_days', sa.Integer(), server_default='7', nullable=False))


def downgrade() -> None:
    op.drop_column('sellers', 'preorder_discount_min_days')
    op.drop_column('sellers', 'preorder_discount_percent')
    op.drop_column('sellers', 'preorder_max_per_date')
    op.drop_column('sellers', 'preorder_min_lead_days')
