"""add subscribed_at to buyer_favorite_sellers and seller_id index

Revision ID: add_subscribed_at_fav
Revises: final_merge_heads
Create Date: 2026-02-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_subscribed_at_fav'
down_revision: Union[str, None] = 'final_merge_heads'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'buyer_favorite_sellers',
        sa.Column('subscribed_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
    )
    op.create_index('ix_favorite_seller_id', 'buyer_favorite_sellers', ['seller_id'])


def downgrade() -> None:
    op.drop_index('ix_favorite_seller_id', table_name='buyer_favorite_sellers')
    op.drop_column('buyer_favorite_sellers', 'subscribed_at')
