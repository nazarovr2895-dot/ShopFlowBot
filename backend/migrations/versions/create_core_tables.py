"""create_core_tables: cities, districts, metro, users, sellers, products, orders

Revision ID: create_core_tables
Revises: 69711a57a071
Create Date: 2026-02-09

The initial migration only creates 'settings'. This migration creates the rest
of the core tables so that add_quantity_to_products and later migrations can run.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'create_core_tables'
down_revision: Union[str, None] = '69711a57a071'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'cities',
        sa.Column('id', sa.Integer(), autoincrement=False, nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'districts',
        sa.Column('id', sa.Integer(), autoincrement=False, nullable=False),
        sa.Column('city_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.ForeignKeyConstraint(['city_id'], ['cities.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_districts_city_id', 'districts', ['city_id'], unique=False)
    op.create_table(
        'metro_stations',
        sa.Column('id', sa.Integer(), autoincrement=False, nullable=False),
        sa.Column('district_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.ForeignKeyConstraint(['district_id'], ['districts.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_metro_stations_district_id', 'metro_stations', ['district_id'], unique=False)
    op.create_table(
        'users',
        sa.Column('tg_id', sa.BigInteger(), autoincrement=False, nullable=False),
        sa.Column('username', sa.String(255), nullable=True),
        sa.Column('fio', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('role', sa.String(20), nullable=False, server_default='BUYER'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('referrer_id', sa.BigInteger(), nullable=True),
        sa.Column('balance', sa.DECIMAL(10, 2), nullable=True, server_default='0'),
        sa.Column('city_id', sa.Integer(), nullable=True),
        sa.Column('district_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['city_id'], ['cities.id']),
        sa.ForeignKeyConstraint(['district_id'], ['districts.id']),
        sa.ForeignKeyConstraint(['referrer_id'], ['users.tg_id']),
        sa.PrimaryKeyConstraint('tg_id'),
    )
    op.create_index('ix_users_referrer_id', 'users', ['referrer_id'], unique=False)
    op.create_index('ix_users_role', 'users', ['role'], unique=False)
    op.create_table(
        'sellers',
        sa.Column('seller_id', sa.BigInteger(), autoincrement=False, nullable=False),
        sa.Column('shop_name', sa.String(255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('city_id', sa.Integer(), nullable=True),
        sa.Column('district_id', sa.Integer(), nullable=True),
        sa.Column('metro_id', sa.Integer(), nullable=True),
        sa.Column('map_url', sa.Text(), nullable=True),
        sa.Column('delivery_type', sa.String(100), nullable=True),
        sa.Column('max_orders', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('is_blocked', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('placement_expired_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['city_id'], ['cities.id']),
        sa.ForeignKeyConstraint(['district_id'], ['districts.id']),
        sa.ForeignKeyConstraint(['metro_id'], ['metro_stations.id']),
        sa.ForeignKeyConstraint(['seller_id'], ['users.tg_id']),
        sa.PrimaryKeyConstraint('seller_id'),
    )
    op.create_index('ix_sellers_city_id', 'sellers', ['city_id'], unique=False)
    op.create_index('ix_sellers_district_id', 'sellers', ['district_id'], unique=False)
    op.create_index('ix_sellers_is_blocked', 'sellers', ['is_blocked'], unique=False)
    op.create_index('ix_sellers_deleted_at', 'sellers', ['deleted_at'], unique=False)
    op.create_table(
        'products',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('seller_id', sa.BigInteger(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('price', sa.DECIMAL(10, 2), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('photo_id', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.ForeignKeyConstraint(['seller_id'], ['users.tg_id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_products_seller_id', 'products', ['seller_id'], unique=False)
    op.create_index('ix_products_is_active', 'products', ['is_active'], unique=False)
    op.create_table(
        'orders',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('buyer_id', sa.BigInteger(), nullable=False),
        sa.Column('seller_id', sa.BigInteger(), nullable=False),
        sa.Column('items_info', sa.Text(), nullable=False),
        sa.Column('total_price', sa.DECIMAL(10, 2), nullable=False),
        sa.Column('status', sa.String(50), nullable=True, server_default='pending'),
        sa.Column('delivery_type', sa.String(50), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['buyer_id'], ['users.tg_id']),
        sa.ForeignKeyConstraint(['seller_id'], ['users.tg_id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_orders_seller_id', 'orders', ['seller_id'], unique=False)
    op.create_index('ix_orders_buyer_id', 'orders', ['buyer_id'], unique=False)
    op.create_index('ix_orders_status', 'orders', ['status'], unique=False)
    op.create_index('ix_orders_created_at', 'orders', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_orders_created_at', table_name='orders')
    op.drop_index('ix_orders_status', table_name='orders')
    op.drop_index('ix_orders_buyer_id', table_name='orders')
    op.drop_index('ix_orders_seller_id', table_name='orders')
    op.drop_table('orders')
    op.drop_index('ix_products_is_active', table_name='products')
    op.drop_index('ix_products_seller_id', table_name='products')
    op.drop_table('products')
    op.drop_index('ix_sellers_deleted_at', table_name='sellers')
    op.drop_index('ix_sellers_is_blocked', table_name='sellers')
    op.drop_index('ix_sellers_district_id', table_name='sellers')
    op.drop_index('ix_sellers_city_id', table_name='sellers')
    op.drop_table('sellers')
    op.drop_index('ix_users_role', table_name='users')
    op.drop_index('ix_users_referrer_id', table_name='users')
    op.drop_table('users')
    op.drop_index('ix_metro_stations_district_id', table_name='metro_stations')
    op.drop_table('metro_stations')
    op.drop_index('ix_districts_city_id', table_name='districts')
    op.drop_table('districts')
    op.drop_table('cities')
