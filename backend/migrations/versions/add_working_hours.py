"""Add working_hours to sellers

Revision ID: add_working_hours
Revises: add_guest_checkout
Create Date: 2026-02-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_working_hours'
down_revision: Union[str, None] = 'add_guest_checkout'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sellers', sa.Column('working_hours', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('sellers', 'working_hours')
