"""add address_name to sellers

Revision ID: add_address_name
Revises: db5bc84b370e
Create Date: 2026-02-15 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_address_name'
down_revision: Union[str, None] = 'db5bc84b370e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add address_name column to sellers table
    op.add_column('sellers', sa.Column('address_name', sa.String(length=512), nullable=True))


def downgrade() -> None:
    # Remove address_name column from sellers table
    op.drop_column('sellers', 'address_name')
