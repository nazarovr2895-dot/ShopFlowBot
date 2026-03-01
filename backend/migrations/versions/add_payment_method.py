"""Add payment_method column to orders table

Revision ID: add_payment_method
Revises: set_default_limits
Create Date: 2026-03-01

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'add_payment_method'
down_revision: Union[str, None] = 'set_default_limits'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('payment_method', sa.String(20), server_default='online', nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'payment_method')
