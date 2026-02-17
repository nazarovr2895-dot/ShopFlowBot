"""add cost_price and markup_percent to products

Revision ID: move_markup_to_product
Revises: p0_missing_columns_tables
Create Date: 2026-02-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'move_markup_to_product'
down_revision: Union[str, None] = 'p0_missing_columns_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('products', sa.Column('cost_price', sa.DECIMAL(10, 2), nullable=True))
    op.add_column('products', sa.Column('markup_percent', sa.DECIMAL(5, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('products', 'markup_percent')
    op.drop_column('products', 'cost_price')
