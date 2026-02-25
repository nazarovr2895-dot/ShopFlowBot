"""add geo_lat/geo_lon to sellers for map display

Revision ID: add_geo_coords_to_sellers
Revises: add_slot_duration
Create Date: 2026-02-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_geo_coords_to_sellers'
down_revision: Union[str, None] = 'add_slot_duration'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sellers', sa.Column('geo_lat', sa.Float(), nullable=True))
    op.add_column('sellers', sa.Column('geo_lon', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('sellers', 'geo_lon')
    op.drop_column('sellers', 'geo_lat')
