"""Add seller_applications table

Revision ID: add_seller_applications
Revises: add_analytics
Create Date: 2026-03-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'add_seller_applications'
down_revision: Union[str, None] = 'add_analytics'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'seller_applications',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('shop_name', sa.String(length=255), nullable=False),
        sa.Column('inn', sa.String(length=12), nullable=False),
        sa.Column('phone', sa.String(length=20), nullable=False),
        sa.Column('org_name', sa.String(length=512), nullable=True),
        sa.Column('org_type', sa.String(length=20), nullable=True),
        sa.Column('ogrn', sa.String(length=15), nullable=True),
        sa.Column('management_name', sa.String(length=255), nullable=True),
        sa.Column('org_address', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='new'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_seller_applications_status', 'seller_applications', ['status'])
    op.create_index('ix_seller_applications_inn', 'seller_applications', ['inn'])


def downgrade() -> None:
    op.drop_index('ix_seller_applications_inn', table_name='seller_applications')
    op.drop_index('ix_seller_applications_status', table_name='seller_applications')
    op.drop_table('seller_applications')
