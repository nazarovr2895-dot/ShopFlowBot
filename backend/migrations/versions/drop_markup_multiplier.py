"""drop markup_multiplier from bouquet_items

Revision ID: drop_markup_multiplier
Revises: move_markup_to_product
Create Date: 2026-02-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'drop_markup_multiplier'
down_revision: Union[str, None] = 'move_markup_to_product'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('bouquet_items', 'markup_multiplier')


def downgrade() -> None:
    op.add_column('bouquet_items', sa.Column('markup_multiplier', sa.DECIMAL(5, 2), nullable=False, server_default='1'))
