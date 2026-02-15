"""merge address_name and customer_notes branches

Revision ID: merge_addr_notes
Revises: add_address_name, a0634400e748
Create Date: 2026-02-15 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'merge_addr_notes'
down_revision: Union[str, None] = ('add_address_name', 'a0634400e748')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # This is a merge migration - no changes needed
    pass


def downgrade() -> None:
    # This is a merge migration - no changes needed
    pass
