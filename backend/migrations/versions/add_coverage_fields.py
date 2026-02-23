"""add coverage fields: kladr_id to cities, line_name/geo/city_id to metro

Revision ID: add_coverage_fields
Revises: seed_moscow_districts
Create Date: 2026-02-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_coverage_fields'
down_revision: Union[str, None] = 'seed_moscow_districts'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # City: add kladr_id for DaData lookups
    op.add_column('cities', sa.Column('kladr_id', sa.String(20), nullable=True))

    # Metro: add line_name, coordinates, city_id; make district_id nullable
    op.add_column('metro_stations', sa.Column('line_name', sa.String(100), nullable=True))
    op.add_column('metro_stations', sa.Column('geo_lat', sa.Float(), nullable=True))
    op.add_column('metro_stations', sa.Column('geo_lon', sa.Float(), nullable=True))
    op.add_column('metro_stations', sa.Column('city_id', sa.Integer(), sa.ForeignKey('cities.id'), nullable=True))
    op.create_index('ix_metro_stations_city_id', 'metro_stations', ['city_id'])

    # Make district_id nullable (for unmapped stations from DaData)
    op.alter_column('metro_stations', 'district_id', existing_type=sa.Integer(), nullable=True)

    # Seed Moscow kladr_id
    op.execute(
        sa.text("UPDATE cities SET kladr_id = :kladr WHERE id = :id")
        .bindparams(kladr="7700000000000", id=1)
    )

    # Backfill city_id for existing Moscow metro stations (via districts)
    op.execute(
        sa.text(
            "UPDATE metro_stations SET city_id = d.city_id "
            "FROM districts d WHERE metro_stations.district_id = d.id "
            "AND metro_stations.city_id IS NULL"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("UPDATE metro_stations SET city_id = NULL"))
    op.drop_index('ix_metro_stations_city_id', table_name='metro_stations')
    op.drop_column('metro_stations', 'city_id')
    op.drop_column('metro_stations', 'geo_lon')
    op.drop_column('metro_stations', 'geo_lat')
    op.drop_column('metro_stations', 'line_name')
    op.alter_column('metro_stations', 'district_id', existing_type=sa.Integer(), nullable=False)
    op.drop_column('cities', 'kladr_id')
