"""add comment to orders

Revision ID: add_comment_orders
Revises: merge_addr_notes
Create Date: 2026-02-15 20:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_comment_orders'
down_revision: Union[str, None] = 'merge_addr_notes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add comment column to orders table
    op.add_column('orders', sa.Column('comment', sa.Text(), nullable=True))


def downgrade() -> None:
    # Remove comment column from orders table
    op.drop_column('orders', 'comment')
