"""Set default limits for all sellers: delivery=10, pickup=20, daily=30

Revision ID: set_default_limits
Revises: add_fts_search
Create Date: 2026-03-01

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'set_default_limits'
down_revision: Union[str, None] = 'add_fts_search'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Set default_daily_limit = 30 where NULL
    op.execute("UPDATE sellers SET default_daily_limit = 30 WHERE default_daily_limit IS NULL")
    # Set max_delivery_orders = 10 where 0 or NULL
    op.execute("UPDATE sellers SET max_delivery_orders = 10 WHERE max_delivery_orders = 0 OR max_delivery_orders IS NULL")
    # Set max_pickup_orders = 20 where 0 or NULL
    op.execute("UPDATE sellers SET max_pickup_orders = 20 WHERE max_pickup_orders = 0 OR max_pickup_orders IS NULL")


def downgrade() -> None:
    # Revert to NULL (original state)
    op.execute("UPDATE sellers SET default_daily_limit = NULL WHERE default_daily_limit = 30")
