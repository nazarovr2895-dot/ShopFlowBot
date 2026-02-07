"""add hashtags to sellers

Revision ID: add_hashtags_sellers
Revises: add_photo_ids
Create Date: 2026-02-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_hashtags_sellers'
down_revision: Union[str, None] = 'add_photo_ids'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sellers', sa.Column('hashtags', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('sellers', 'hashtags')
