"""merge_heads

Revision ID: db5bc84b370e
Revises: add_favorite_products, add_inn_to_sellers
Create Date: 2026-02-15 13:16:50.918882

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'db5bc84b370e'
down_revision: Union[str, None] = ('add_favorite_products', 'add_inn_to_sellers')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
