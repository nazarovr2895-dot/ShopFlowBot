"""add commission_percent to sellers and update global default to 3%

Revision ID: add_seller_commission
Revises: add_stock_reservation
Create Date: 2026-02-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_seller_commission'
down_revision: Union[str, None] = 'add_stock_reservation'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add per-seller commission override column (null = use global)
    op.add_column('sellers', sa.Column('commission_percent', sa.Integer(), nullable=True))
    # Update global default from 18% to 3%
    op.execute("UPDATE settings SET commission_percent = 3 WHERE commission_percent = 18")


def downgrade() -> None:
    op.drop_column('sellers', 'commission_percent')
    op.execute("UPDATE settings SET commission_percent = 18 WHERE commission_percent = 3")
