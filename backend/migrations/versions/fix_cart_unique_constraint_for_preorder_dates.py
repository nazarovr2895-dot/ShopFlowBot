"""fix cart unique constraint to allow same product on different preorder dates

Revision ID: fix_cart_uq_preorder_date
Revises: drop_markup_multiplier
Create Date: 2026-02-17

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'fix_cart_uq_preorder_date'
down_revision: Union[str, None] = 'drop_markup_multiplier'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop old constraint that prevented same product on different dates
    op.drop_constraint('uq_cart_buyer_seller_product', 'cart_items', type_='unique')
    # Create new constraint including preorder_delivery_date
    op.create_unique_constraint(
        'uq_cart_buyer_seller_product_date',
        'cart_items',
        ['buyer_id', 'seller_id', 'product_id', 'preorder_delivery_date'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_cart_buyer_seller_product_date', 'cart_items', type_='unique')
    op.create_unique_constraint(
        'uq_cart_buyer_seller_product',
        'cart_items',
        ['buyer_id', 'seller_id', 'product_id'],
    )
