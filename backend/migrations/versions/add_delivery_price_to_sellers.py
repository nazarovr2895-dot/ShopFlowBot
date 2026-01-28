"""add_delivery_price_to_sellers

Revision ID: add_delivery_price_to_sellers
Revises: add_quantity_to_products
Create Date: 2026-01-27 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_delivery_price_to_sellers'
down_revision: Union[str, None] = 'add_quantity_to_products'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Добавляем поле delivery_price в таблицу sellers
    op.add_column('sellers', sa.Column('delivery_price', sa.DECIMAL(10, 2), nullable=False, server_default='0.0'))


def downgrade() -> None:
    # Удаляем поле delivery_price из таблицы sellers
    op.drop_column('sellers', 'delivery_price')
