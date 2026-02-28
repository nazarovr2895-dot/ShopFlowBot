"""Add contact_tg_id to sellers for per-branch notifications

Revision ID: add_contact_tg_id
Revises: add_multi_branch
Create Date: 2026-02-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_contact_tg_id'
down_revision: Union[str, None] = 'add_multi_branch'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add contact_tg_id column (nullable — falls back to owner_id in code)
    op.add_column('sellers', sa.Column('contact_tg_id', sa.BigInteger(), nullable=True))

    # For original sellers (seller_id == owner_id), set contact_tg_id = seller_id (their tg_id)
    op.execute('UPDATE sellers SET contact_tg_id = seller_id WHERE seller_id = owner_id')

    # Index for lookups
    op.create_index('ix_sellers_contact_tg_id', 'sellers', ['contact_tg_id'])


def downgrade() -> None:
    op.drop_index('ix_sellers_contact_tg_id', table_name='sellers')
    op.drop_column('sellers', 'contact_tg_id')
