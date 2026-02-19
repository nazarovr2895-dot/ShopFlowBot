"""Add composition JSON column to products

Revision ID: add_product_composition
Revises: add_working_hours
Create Date: 2026-02-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_product_composition'
down_revision: Union[str, None] = 'add_working_hours'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('products', sa.Column('composition', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('products', 'composition')
