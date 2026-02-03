"""add_crm_flowers_receptions_v1

Revision ID: add_crm_flowers_receptions_v1
Revises: add_web_login_sellers
Create Date: 2026-02-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_crm_flowers_receptions_v1'
down_revision: Union[str, None] = 'add_web_login_sellers'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'flowers',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('seller_id', sa.BigInteger(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('default_shelf_life_days', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['seller_id'], ['users.tg_id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_flowers_seller_id', 'flowers', ['seller_id'], unique=False)

    op.create_table(
        'receptions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('seller_id', sa.BigInteger(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('reception_date', sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(['seller_id'], ['users.tg_id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_receptions_seller_id', 'receptions', ['seller_id'], unique=False)

    op.create_table(
        'bouquets',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('seller_id', sa.BigInteger(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('packaging_cost', sa.DECIMAL(10, 2), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['seller_id'], ['users.tg_id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_bouquets_seller_id', 'bouquets', ['seller_id'], unique=False)

    op.create_table(
        'reception_items',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('reception_id', sa.Integer(), nullable=False),
        sa.Column('flower_id', sa.Integer(), nullable=False),
        sa.Column('quantity_initial', sa.Integer(), nullable=False),
        sa.Column('arrival_date', sa.Date(), nullable=True),
        sa.Column('shelf_life_days', sa.Integer(), nullable=False),
        sa.Column('price_per_unit', sa.DECIMAL(10, 2), nullable=False),
        sa.Column('remaining_quantity', sa.Integer(), nullable=False),
        sa.Column('sold_quantity', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('sold_amount', sa.DECIMAL(12, 2), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['flower_id'], ['flowers.id'], ),
        sa.ForeignKeyConstraint(['reception_id'], ['receptions.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_reception_items_reception_id', 'reception_items', ['reception_id'], unique=False)

    op.create_table(
        'bouquet_items',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('bouquet_id', sa.Integer(), nullable=False),
        sa.Column('flower_id', sa.Integer(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('markup_multiplier', sa.DECIMAL(5, 2), nullable=False, server_default='1'),
        sa.ForeignKeyConstraint(['bouquet_id'], ['bouquets.id'], ),
        sa.ForeignKeyConstraint(['flower_id'], ['flowers.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_bouquet_items_bouquet_id', 'bouquet_items', ['bouquet_id'], unique=False)

    op.add_column('products', sa.Column('bouquet_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_products_bouquet_id', 'products', 'bouquets', ['bouquet_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_products_bouquet_id', 'products', type_='foreignkey')
    op.drop_column('products', 'bouquet_id')
    op.drop_index('ix_bouquet_items_bouquet_id', table_name='bouquet_items')
    op.drop_table('bouquet_items')
    op.drop_index('ix_reception_items_reception_id', table_name='reception_items')
    op.drop_table('reception_items')
    op.drop_index('ix_bouquets_seller_id', table_name='bouquets')
    op.drop_table('bouquets')
    op.drop_index('ix_receptions_seller_id', table_name='receptions')
    op.drop_table('receptions')
    op.drop_index('ix_flowers_seller_id', table_name='flowers')
    op.drop_table('flowers')
