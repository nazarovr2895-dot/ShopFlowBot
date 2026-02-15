"""add ON DELETE CASCADE for product_id FKs (cart_items, buyer_favorite_products)

Revision ID: add_cascade_product_fk
Revises: add_banner_url
Create Date: 2026-02-15

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'add_cascade_product_fk'
down_revision: Union[str, None] = 'add_banner_url'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # cart_items: drop FK, recreate with ON DELETE CASCADE
    op.drop_constraint('cart_items_product_id_fkey', 'cart_items', type_='foreignkey')
    op.create_foreign_key(
        'cart_items_product_id_fkey',
        'cart_items',
        'products',
        ['product_id'],
        ['id'],
        ondelete='CASCADE',
    )
    # buyer_favorite_products: drop FK, recreate with ON DELETE CASCADE
    op.drop_constraint('buyer_favorite_products_product_id_fkey', 'buyer_favorite_products', type_='foreignkey')
    op.create_foreign_key(
        'buyer_favorite_products_product_id_fkey',
        'buyer_favorite_products',
        'products',
        ['product_id'],
        ['id'],
        ondelete='CASCADE',
    )


def downgrade() -> None:
    # Restore FKs without CASCADE
    op.drop_constraint('buyer_favorite_products_product_id_fkey', 'buyer_favorite_products', type_='foreignkey')
    op.create_foreign_key(
        'buyer_favorite_products_product_id_fkey',
        'buyer_favorite_products',
        'products',
        ['product_id'],
        ['id'],
    )
    op.drop_constraint('cart_items_product_id_fkey', 'cart_items', type_='foreignkey')
    op.create_foreign_key(
        'cart_items_product_id_fkey',
        'cart_items',
        'products',
        ['product_id'],
        ['id'],
    )
