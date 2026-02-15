"""final merge: combine add_comment_orders and add_cascade_product_fk

Revision ID: final_merge_heads
Revises: add_comment_orders, add_cascade_product_fk
Create Date: 2026-02-15 23:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'final_merge_heads'
down_revision: Union[str, None] = ('add_comment_orders', 'add_cascade_product_fk')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # This is a merge migration - no changes needed
    pass


def downgrade() -> None:
    # This is a merge migration - no changes needed
    pass
