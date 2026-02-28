"""Add max_branches to sellers for network seller support

Revision ID: add_max_branches
Revises: add_contact_tg_id
Create Date: 2026-02-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_max_branches'
down_revision: Union[str, None] = 'add_contact_tg_id'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sellers', sa.Column('max_branches', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('sellers', 'max_branches')
