"""add_quantity_to_products

Revision ID: add_quantity_to_products
Revises: 69711a57a071
Create Date: 2026-01-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_quantity_to_products'
down_revision: Union[str, None] = '69711a57a071'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Добавляем поле quantity в таблицу products
    op.add_column('products', sa.Column('quantity', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    # Удаляем поле quantity из таблицы products
    op.drop_column('products', 'quantity')
