"""Add is_addon to categories

Revision ID: add_is_addon_categories
Revises: add_refresh_tokens
Create Date: 2026-03-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_is_addon_categories"
down_revision: Union[str, None] = "add_refresh_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("categories", sa.Column("is_addon", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.create_index("ix_categories_seller_addon", "categories", ["seller_id", "is_addon"])


def downgrade() -> None:
    op.drop_index("ix_categories_seller_addon", table_name="categories")
    op.drop_column("categories", "is_addon")
