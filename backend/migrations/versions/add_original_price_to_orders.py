"""add_original_price_to_orders

Revision ID: add_original_price_to_orders
Revises: add_delivery_price_to_sellers
Create Date: 2026-01-27 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_original_price_to_orders'
down_revision: Union[str, None] = 'add_delivery_price_to_sellers'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Добавляем поле original_price в таблицу orders
    op.add_column('orders', sa.Column('original_price', sa.DECIMAL(10, 2), nullable=True))


def downgrade() -> None:
    # Удаляем поле original_price из таблицы orders
    op.drop_column('orders', 'original_price')
