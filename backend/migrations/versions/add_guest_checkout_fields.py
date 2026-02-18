"""add guest checkout fields to orders

Revision ID: add_guest_checkout
Revises: add_sub_plan_schedule
Create Date: 2026-02-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_guest_checkout'
down_revision: Union[str, None] = 'add_sub_plan_schedule'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Make buyer_id nullable (guest orders have no Telegram user)
    op.alter_column('orders', 'buyer_id', existing_type=sa.BigInteger(), nullable=True)
    # Add guest contact fields
    op.add_column('orders', sa.Column('guest_name', sa.String(255), nullable=True))
    op.add_column('orders', sa.Column('guest_phone', sa.String(50), nullable=True))
    op.add_column('orders', sa.Column('guest_address', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'guest_address')
    op.drop_column('orders', 'guest_phone')
    op.drop_column('orders', 'guest_name')
    op.alter_column('orders', 'buyer_id', existing_type=sa.BigInteger(), nullable=False)
