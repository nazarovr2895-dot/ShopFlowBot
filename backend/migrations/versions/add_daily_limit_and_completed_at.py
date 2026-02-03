"""add_daily_limit_and_completed_at

Revision ID: add_daily_limit_and_completed_at
Revises: add_original_price_to_orders
Create Date: 2026-02-03 12:00:00.000000

"""
from typing import Sequence, Union
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from alembic import op
import sqlalchemy as sa


revision: str = 'add_daily_limit_and_completed_at'
down_revision: Union[str, None] = 'add_walk_minutes_to_sellers'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('completed_at', sa.DateTime(), nullable=True))
    op.add_column('sellers', sa.Column('daily_limit_date', sa.Date(), nullable=True))
    # Существующие продавцы с max_orders > 0: задаём им «сегодня» как дату лимита (до следующего 6:00 всё как раньше)
    conn = op.get_bind()
    tz = ZoneInfo("Europe/Moscow")
    now = datetime.now(tz)
    today = now.date() if now.hour >= 6 else (now.date() - timedelta(days=1))
    conn.execute(
        sa.text(
            "UPDATE sellers SET daily_limit_date = :d WHERE daily_limit_date IS NULL AND max_orders > 0"
        ),
        {"d": today}
    )


def downgrade() -> None:
    op.drop_column('orders', 'completed_at')
    op.drop_column('sellers', 'daily_limit_date')
