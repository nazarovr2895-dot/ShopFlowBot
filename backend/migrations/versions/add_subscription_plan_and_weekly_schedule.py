"""add subscription_plan and weekly_schedule to sellers

Revision ID: add_sub_plan_schedule
Revises: add_default_daily_limit
Create Date: 2026-02-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_sub_plan_schedule'
down_revision: Union[str, None] = 'add_default_daily_limit'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sellers', sa.Column('subscription_plan', sa.String(20), server_default='free', nullable=False))
    op.add_column('sellers', sa.Column('weekly_schedule', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('sellers', 'weekly_schedule')
    op.drop_column('sellers', 'subscription_plan')
