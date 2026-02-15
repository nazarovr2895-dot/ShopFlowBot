"""add_customer_notes_tags

Revision ID: a0634400e748
Revises: db5bc84b370e
Create Date: 2026-02-15 13:16:55.256410

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a0634400e748'
down_revision: Union[str, None] = 'db5bc84b370e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add notes and tags columns to seller_customers table
    op.add_column('seller_customers', sa.Column('notes', sa.Text(), nullable=True))
    op.add_column('seller_customers', sa.Column('tags', sa.Text(), nullable=True))


def downgrade() -> None:
    # Remove notes and tags columns
    op.drop_column('seller_customers', 'tags')
    op.drop_column('seller_customers', 'notes')
