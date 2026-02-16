"""add ogrn to sellers

Revision ID: add_ogrn_to_sellers
Revises: add_subscribed_at_fav
Create Date: 2026-02-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_ogrn_to_sellers'
down_revision: Union[str, None] = 'add_subscribed_at_fav'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sellers', sa.Column('ogrn', sa.String(15), nullable=True))
    op.create_index('ix_sellers_ogrn', 'sellers', ['ogrn'])


def downgrade() -> None:
    op.drop_index('ix_sellers_ogrn', table_name='sellers')
    op.drop_column('sellers', 'ogrn')
