"""add web_login and web_password_hash to sellers

Revision ID: add_web_login_sellers
Revises: reset_seller_limits_to_zero
Create Date: 2026-02-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_web_login_sellers'
down_revision: Union[str, None] = 'reset_seller_limits_to_zero'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sellers', sa.Column('web_login', sa.String(64), nullable=True))
    op.add_column('sellers', sa.Column('web_password_hash', sa.String(255), nullable=True))
    op.create_index('ix_sellers_web_login', 'sellers', ['web_login'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_sellers_web_login', table_name='sellers')
    op.drop_column('sellers', 'web_password_hash')
    op.drop_column('sellers', 'web_login')
