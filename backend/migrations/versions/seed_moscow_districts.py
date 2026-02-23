"""seed moscow districts

Revision ID: seed_moscow_districts
Revises: add_delivery_zones
Create Date: 2026-02-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'seed_moscow_districts'
down_revision: Union[str, None] = 'add_delivery_zones'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Moscow city_id = 1 (as used throughout the codebase)
MOSCOW_CITY_ID = 1

MOSCOW_DISTRICTS = [
    (1, "ЦАО"),
    (2, "САО"),
    (3, "СВАО"),
    (4, "ВАО"),
    (5, "ЮВАО"),
    (6, "ЮАО"),
    (7, "ЮЗАО"),
    (8, "ЗАО"),
    (9, "СЗАО"),
    (10, "Зеленоградский"),
    (11, "Новомосковский"),
    (12, "Троицкий"),
]


def upgrade() -> None:
    # Ensure Moscow city exists
    op.execute(
        sa.text(
            "INSERT INTO cities (id, name) VALUES (:id, :name) ON CONFLICT (id) DO NOTHING"
        ).bindparams(id=MOSCOW_CITY_ID, name="Москва")
    )

    # Seed all Moscow districts
    for district_id, name in MOSCOW_DISTRICTS:
        op.execute(
            sa.text(
                "INSERT INTO districts (id, city_id, name) VALUES (:id, :city_id, :name) "
                "ON CONFLICT (id) DO NOTHING"
            ).bindparams(id=district_id, city_id=MOSCOW_CITY_ID, name=name)
        )


def downgrade() -> None:
    # Don't delete districts on downgrade — they might be referenced by sellers/zones
    pass
