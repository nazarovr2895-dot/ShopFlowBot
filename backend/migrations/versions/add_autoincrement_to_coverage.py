"""add autoincrement sequences to cities, districts, metro_stations

The original migration created these tables with autoincrement=False
because data was seeded with explicit IDs. Now that we have CRUD in the
admin panel, we need auto-increment so INSERTs without explicit id work.

Revision ID: add_autoincrement_to_coverage
Revises: add_coverage_fields
Create Date: 2026-02-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_autoincrement_to_coverage'
down_revision: Union[str, None] = 'add_coverage_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create sequences starting after current max IDs
    op.execute(sa.text("CREATE SEQUENCE IF NOT EXISTS cities_id_seq"))
    op.execute(sa.text("SELECT setval('cities_id_seq', COALESCE((SELECT MAX(id) FROM cities), 0) + 1, false)"))
    op.execute(sa.text("ALTER TABLE cities ALTER COLUMN id SET DEFAULT nextval('cities_id_seq')"))
    op.execute(sa.text("ALTER SEQUENCE cities_id_seq OWNED BY cities.id"))

    op.execute(sa.text("CREATE SEQUENCE IF NOT EXISTS districts_id_seq"))
    op.execute(sa.text("SELECT setval('districts_id_seq', COALESCE((SELECT MAX(id) FROM districts), 0) + 1, false)"))
    op.execute(sa.text("ALTER TABLE districts ALTER COLUMN id SET DEFAULT nextval('districts_id_seq')"))
    op.execute(sa.text("ALTER SEQUENCE districts_id_seq OWNED BY districts.id"))

    op.execute(sa.text("CREATE SEQUENCE IF NOT EXISTS metro_stations_id_seq"))
    op.execute(sa.text("SELECT setval('metro_stations_id_seq', COALESCE((SELECT MAX(id) FROM metro_stations), 0) + 1, false)"))
    op.execute(sa.text("ALTER TABLE metro_stations ALTER COLUMN id SET DEFAULT nextval('metro_stations_id_seq')"))
    op.execute(sa.text("ALTER SEQUENCE metro_stations_id_seq OWNED BY metro_stations.id"))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE metro_stations ALTER COLUMN id DROP DEFAULT"))
    op.execute(sa.text("DROP SEQUENCE IF EXISTS metro_stations_id_seq"))

    op.execute(sa.text("ALTER TABLE districts ALTER COLUMN id DROP DEFAULT"))
    op.execute(sa.text("DROP SEQUENCE IF EXISTS districts_id_seq"))

    op.execute(sa.text("ALTER TABLE cities ALTER COLUMN id DROP DEFAULT"))
    op.execute(sa.text("DROP SEQUENCE IF EXISTS cities_id_seq"))
