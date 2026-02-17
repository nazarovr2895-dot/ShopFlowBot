"""add default_daily_limit to sellers

Revision ID: add_default_daily_limit
Revises: add_preorder_settings
Create Date: 2026-02-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_default_daily_limit'
down_revision: Union[str, None] = 'add_preorder_settings'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sellers', sa.Column('default_daily_limit', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('sellers', 'default_daily_limit')
