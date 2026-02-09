"""add reception is_closed, supplier, invoice_number

Revision ID: add_reception_status
Revises: add_favorite_sellers
Create Date: 2026-02-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_reception_status'
down_revision: Union[str, None] = 'add_favorite_sellers'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('receptions', sa.Column('is_closed', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('receptions', sa.Column('supplier', sa.String(255), nullable=True))
    op.add_column('receptions', sa.Column('invoice_number', sa.String(128), nullable=True))


def downgrade() -> None:
    op.drop_column('receptions', 'invoice_number')
    op.drop_column('receptions', 'supplier')
    op.drop_column('receptions', 'is_closed')
