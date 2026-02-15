"""add banner_url to sellers

Revision ID: add_banner_url
Revises: db5bc84b370e
Create Date: 2026-02-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_banner_url'
down_revision: Union[str, None] = 'a0634400e748'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sellers', sa.Column('banner_url', sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column('sellers', 'banner_url')
