"""P1: tiers config, points expiry, structured tags (Text->JSON)

Revision ID: p1_tiers_expiry_tags
Revises: add_ogrn_to_sellers
Create Date: 2026-02-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'p1_tiers_expiry_tags'
down_revision: Union[str, None] = 'add_ogrn_to_sellers'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- sellers table: loyalty tiers + points expiry ---
    op.add_column('sellers', sa.Column('loyalty_tiers_config', sa.JSON(), nullable=True))
    op.add_column('sellers', sa.Column('points_expire_days', sa.Integer(), nullable=True))

    # --- seller_customers.tags: Text -> JSON ---
    # Convert existing text tags to JSON arrays, then alter column type
    op.execute("""
        UPDATE seller_customers
        SET tags = NULL
        WHERE tags IS NOT NULL AND tags = ''
    """)
    op.execute("""
        UPDATE seller_customers
        SET tags = (
            SELECT jsonb_agg(trim(elem))
            FROM unnest(string_to_array(tags::text, ',')) AS elem
            WHERE trim(elem) != ''
        )::text
        WHERE tags IS NOT NULL AND tags != ''
    """)
    op.alter_column('seller_customers', 'tags',
                     type_=sa.JSON(),
                     existing_type=sa.Text(),
                     postgresql_using='tags::json',
                     nullable=True)

    # --- seller_loyalty_transactions: expires_at + is_expired ---
    op.add_column('seller_loyalty_transactions', sa.Column('expires_at', sa.DateTime(), nullable=True))
    op.add_column('seller_loyalty_transactions', sa.Column('is_expired', sa.Boolean(), server_default='false', nullable=False))
    op.create_index('ix_seller_loyalty_tx_expires_at', 'seller_loyalty_transactions', ['expires_at'])


def downgrade() -> None:
    # --- seller_loyalty_transactions ---
    op.drop_index('ix_seller_loyalty_tx_expires_at', table_name='seller_loyalty_transactions')
    op.drop_column('seller_loyalty_transactions', 'is_expired')
    op.drop_column('seller_loyalty_transactions', 'expires_at')

    # --- seller_customers.tags: JSON -> Text ---
    op.alter_column('seller_customers', 'tags',
                     type_=sa.Text(),
                     existing_type=sa.JSON(),
                     postgresql_using="tags::text",
                     nullable=True)

    # --- sellers ---
    op.drop_column('sellers', 'points_expire_days')
    op.drop_column('sellers', 'loyalty_tiers_config')
