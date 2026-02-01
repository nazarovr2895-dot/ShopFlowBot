"""add line_color to metro_stations and metro_walk_minutes to sellers

Revision ID: add_metro_line_color_walk
Revises: add_original_price_to_orders
Create Date: 2026-02-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_metro_line_color_walk'
down_revision: Union[str, None] = 'add_original_price_to_orders'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('metro_stations', sa.Column('line_color', sa.String(7), nullable=True))
    op.add_column('sellers', sa.Column('metro_walk_minutes', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('sellers', 'metro_walk_minutes')
    op.drop_column('metro_stations', 'line_color')
