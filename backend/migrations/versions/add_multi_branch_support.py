"""Add multi-branch support: owner_id, re-target FKs, network loyalty

- sellers: add owner_id (FK users.tg_id), drop FK seller_id->users.tg_id
- All dependent tables: re-target seller_id FK from users.tg_id to sellers.seller_id
- seller_customers: add network_owner_id, change unique constraint
- Create sequence for new branch seller_ids

Revision ID: add_multi_branch
Revises: fix_cart_uq_preorder_date
Create Date: 2026-02-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_multi_branch'
down_revision: Union[str, None] = 'fix_cart_uq_preorder_date'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Tables whose seller_id FK needs re-targeting from users.tg_id to sellers.seller_id
# Format: (table_name, fk_constraint_name)
SELLER_FK_TABLES = [
    ('products', 'products_seller_id_fkey'),
    ('orders', 'orders_seller_id_fkey'),
    ('categories', 'categories_seller_id_fkey'),
    ('cart_items', 'cart_items_seller_id_fkey'),
    ('buyer_favorite_sellers', 'buyer_favorite_sellers_seller_id_fkey'),
    ('seller_customers', 'seller_customers_seller_id_fkey'),
    ('seller_loyalty_transactions', 'seller_loyalty_transactions_seller_id_fkey'),
    ('customer_events', 'customer_events_seller_id_fkey'),
    ('subscriptions', 'subscriptions_seller_id_fkey'),
    ('flowers', 'flowers_seller_id_fkey'),
    ('receptions', 'receptions_seller_id_fkey'),
    ('bouquets', 'bouquets_seller_id_fkey'),
    ('write_offs', 'write_offs_seller_id_fkey'),
]


def upgrade() -> None:
    # ── Step 1: Add owner_id to sellers (nullable initially) ──
    op.add_column('sellers', sa.Column('owner_id', sa.BigInteger(), nullable=True))

    # ── Step 2: Populate owner_id = seller_id for all existing sellers ──
    op.execute('UPDATE sellers SET owner_id = seller_id')

    # ── Step 3: Make owner_id NOT NULL, add FK and index ──
    op.alter_column('sellers', 'owner_id', nullable=False)
    op.create_foreign_key(
        'fk_sellers_owner_id', 'sellers', 'users',
        ['owner_id'], ['tg_id']
    )
    op.create_index('ix_sellers_owner_id', 'sellers', ['owner_id'])

    # ── Step 4: Drop FK sellers.seller_id → users.tg_id ──
    op.drop_constraint('sellers_seller_id_fkey', 'sellers', type_='foreignkey')

    # ── Step 5: Re-target all dependent table FKs ──
    for table_name, fk_name in SELLER_FK_TABLES:
        # Drop old FK (seller_id → users.tg_id)
        op.drop_constraint(fk_name, table_name, type_='foreignkey')
        # Add new FK (seller_id → sellers.seller_id)
        op.create_foreign_key(
            fk_name, table_name, 'sellers',
            ['seller_id'], ['seller_id']
        )

    # ── Step 6: Create sequence for new auto-generated seller_ids ──
    op.execute("""
        CREATE SEQUENCE IF NOT EXISTS sellers_seller_id_seq;
        SELECT setval('sellers_seller_id_seq', COALESCE((SELECT MAX(seller_id) FROM sellers), 0) + 1000);
        ALTER TABLE sellers ALTER COLUMN seller_id SET DEFAULT nextval('sellers_seller_id_seq');
    """)

    # ── Step 7: seller_customers — add network_owner_id for network-wide loyalty ──
    op.add_column('seller_customers',
        sa.Column('network_owner_id', sa.BigInteger(), nullable=True)
    )
    # Populate from sellers.owner_id
    op.execute("""
        UPDATE seller_customers sc
        SET network_owner_id = s.owner_id
        FROM sellers s
        WHERE s.seller_id = sc.seller_id
    """)
    # Make NOT NULL
    op.alter_column('seller_customers', 'network_owner_id', nullable=False)
    op.create_foreign_key(
        'fk_seller_customers_network_owner', 'seller_customers', 'users',
        ['network_owner_id'], ['tg_id']
    )
    op.create_index('ix_seller_customers_network_owner_id', 'seller_customers', ['network_owner_id'])

    # Change unique constraint from (seller_id, phone) to (network_owner_id, phone)
    op.drop_constraint('uq_seller_customers_seller_phone', 'seller_customers', type_='unique')
    op.create_unique_constraint(
        'uq_seller_customers_network_phone', 'seller_customers',
        ['network_owner_id', 'phone']
    )


def downgrade() -> None:
    # ── Reverse Step 7: seller_customers ──
    op.drop_constraint('uq_seller_customers_network_phone', 'seller_customers', type_='unique')
    op.create_unique_constraint(
        'uq_seller_customers_seller_phone', 'seller_customers',
        ['seller_id', 'phone']
    )
    op.drop_constraint('fk_seller_customers_network_owner', 'seller_customers', type_='foreignkey')
    op.drop_index('ix_seller_customers_network_owner_id', table_name='seller_customers')
    op.drop_column('seller_customers', 'network_owner_id')

    # ── Reverse Step 6: Drop sequence & default ──
    op.execute("""
        ALTER TABLE sellers ALTER COLUMN seller_id DROP DEFAULT;
        DROP SEQUENCE IF EXISTS sellers_seller_id_seq;
    """)

    # ── Reverse Step 5: Re-target FKs back to users.tg_id ──
    for table_name, fk_name in SELLER_FK_TABLES:
        op.drop_constraint(fk_name, table_name, type_='foreignkey')
        op.create_foreign_key(
            fk_name, table_name, 'users',
            ['seller_id'], ['tg_id']
        )

    # ── Reverse Step 4: Restore FK sellers.seller_id → users.tg_id ──
    op.create_foreign_key(
        'sellers_seller_id_fkey', 'sellers', 'users',
        ['seller_id'], ['tg_id']
    )

    # ── Reverse Steps 1-3: Drop owner_id ──
    op.drop_index('ix_sellers_owner_id', table_name='sellers')
    op.drop_constraint('fk_sellers_owner_id', 'sellers', type_='foreignkey')
    op.drop_column('sellers', 'owner_id')
