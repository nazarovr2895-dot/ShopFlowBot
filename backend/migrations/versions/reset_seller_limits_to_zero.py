"""reset_seller_limits_to_zero

Обнуляет лимиты у всех продавцов: max_orders=0, daily_limit_date=NULL.
После 6:00 каждый продавец должен будет указать лимит на день в настройках.

Revision ID: reset_seller_limits_to_zero
Revises: add_daily_limit_and_completed_at
Create Date: 2026-02-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'reset_seller_limits_to_zero'
down_revision: Union[str, None] = 'add_referrals_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text("UPDATE sellers SET max_orders = 0, daily_limit_date = NULL")
    )


def downgrade() -> None:
    # Откат: вернуть лимит 10 и «сегодня» как дату лимита (условно)
    op.execute(
        sa.text("UPDATE sellers SET max_orders = 10, daily_limit_date = CURRENT_DATE WHERE daily_limit_date IS NULL")
    )
