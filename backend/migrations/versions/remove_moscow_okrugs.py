"""Remove Moscow okrugs, null out references for soft migration to rayons

Revision ID: remove_moscow_okrugs
Revises: add_autoincrement_to_coverage
Create Date: 2026-02-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'remove_moscow_okrugs'
down_revision: Union[str, None] = 'add_autoincrement_to_coverage'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Moscow city_id = 1, old okrug district IDs = 1-12
MOSCOW_CITY_ID = 1
OLD_OKRUG_IDS = list(range(1, 13))


def upgrade() -> None:
    # 1. NULL out district_id for sellers referencing old okrugs
    op.execute(
        sa.text(
            "UPDATE sellers SET district_id = NULL "
            "WHERE district_id IN :ids"
        ).bindparams(ids=tuple(OLD_OKRUG_IDS))
    )

    # 2. Clear district_ids in delivery_zones for Moscow sellers
    # (simpler and safer than parsing JSON array)
    op.execute(
        sa.text(
            "UPDATE delivery_zones SET district_ids = '[]' "
            "WHERE seller_id IN (SELECT seller_id FROM sellers WHERE city_id = :city_id) "
            "AND district_ids IS NOT NULL "
            "AND district_ids::text != '[]'"
        ).bindparams(city_id=MOSCOW_CITY_ID)
    )

    # 3. NULL out district_id for metro stations referencing old okrugs
    op.execute(
        sa.text(
            "UPDATE metro_stations SET district_id = NULL "
            "WHERE district_id IN :ids"
        ).bindparams(ids=tuple(OLD_OKRUG_IDS))
    )

    # 4. DELETE old okrug districts
    op.execute(
        sa.text(
            "DELETE FROM districts WHERE id IN :ids AND city_id = :city_id"
        ).bindparams(ids=tuple(OLD_OKRUG_IDS), city_id=MOSCOW_CITY_ID)
    )


def downgrade() -> None:
    # Re-insert the 12 okrugs (but don't restore seller/zone/metro links)
    okrugs = [
        (1, "ЦАО"), (2, "САО"), (3, "СВАО"), (4, "ВАО"),
        (5, "ЮВАО"), (6, "ЮАО"), (7, "ЮЗАО"), (8, "ЗАО"),
        (9, "СЗАО"), (10, "Зеленоградский"), (11, "Новомосковский"), (12, "Троицкий"),
    ]
    for district_id, name in okrugs:
        op.execute(
            sa.text(
                "INSERT INTO districts (id, city_id, name) VALUES (:id, :city_id, :name) "
                "ON CONFLICT (id) DO NOTHING"
            ).bindparams(id=district_id, city_id=MOSCOW_CITY_ID, name=name)
        )
