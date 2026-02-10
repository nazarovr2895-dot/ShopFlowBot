"""add_active_orders_and_pending_requests

Revision ID: add_active_orders_and_pending_requests
Revises: add_preorder_custom_dates
Create Date: 2026-02-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_active_orders_and_pending_requests'
down_revision: Union[str, None] = 'add_preorder_custom_dates'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Добавляем поля active_orders и pending_requests в таблицу sellers
    op.add_column('sellers', sa.Column('active_orders', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('sellers', sa.Column('pending_requests', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    # Удаляем поля active_orders и pending_requests из таблицы sellers
    op.drop_column('sellers', 'pending_requests')
    op.drop_column('sellers', 'active_orders')
