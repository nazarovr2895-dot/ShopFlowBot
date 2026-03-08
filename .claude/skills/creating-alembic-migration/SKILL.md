---
name: creating-alembic-migration
description: Create and manage Alembic database migrations for the Flurai backend. Use when modifying SQLAlchemy models or database schema.
argument-hint: [create "message" | upgrade | downgrade | history]
---

# Creating Alembic Migrations

The project uses async SQLAlchemy 2.0 with PostgreSQL (production) and SQLite (tests). 73+ migrations exist — follow established conventions.

## Commands

```bash
# Create auto-generated migration
cd backend && alembic revision --autogenerate -m "add_feature_name"

# Apply all pending migrations
alembic upgrade head

# Rollback last migration
alembic downgrade -1

# View recent migration history
alembic history --verbose -5

# Show current revision
alembic current
```

## Migration File Structure

```python
"""add feature description

Revision ID: abc123def456
Revises: prev_revision_hash
Create Date: 2025-01-15 12:00:00.000000
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'abc123def456'
down_revision: Union[str, None] = 'prev_revision_hash'
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column('sellers', sa.Column('commission_percent', sa.Integer(), nullable=True))
    op.create_index('ix_sellers_commission_percent', 'sellers', ['commission_percent'])


def downgrade() -> None:
    op.drop_index('ix_sellers_commission_percent', table_name='sellers')
    op.drop_column('sellers', 'commission_percent')
```

## Naming Conventions

- **Index names**: `ix_{table}_{column}` or `ix_{table}_{col1}_{col2}` for composite
  - Example: `ix_orders_seller_status`, `ix_products_seller_id`
- **Migration message**: Lowercase, descriptive: `"add_stock_reservation"`, `"add_seller_commission"`
- **Foreign keys**: Let SQLAlchemy auto-name them, or use `fk_{table}_{column}_{ref_table}`

## Rules

1. **Always review generated migration** — remove autogenerate noise (index drops/creates that aren't needed)
2. **Always implement `downgrade()`** — must be reversible
3. **Data migrations** — use `op.execute()` for SQL updates:
   ```python
   op.execute("UPDATE sellers SET commission_percent = 3 WHERE commission_percent IS NULL")
   ```
4. **Don't drop columns with data** without confirming with user — data loss is irreversible
5. **Nullable first** — add new columns as `nullable=True`, then backfill, then optionally alter to `nullable=False`
6. **Test the migration** — run `alembic upgrade head` then `alembic downgrade -1` to verify both directions

## Common Operations

### Add column
```python
op.add_column('table', sa.Column('name', sa.String(255), nullable=True))
```

### Add column with default
```python
op.add_column('table', sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False))
```

### Create table
```python
op.create_table(
    'my_table',
    sa.Column('id', sa.Integer(), primary_key=True),
    sa.Column('seller_id', sa.BigInteger(), sa.ForeignKey('sellers.seller_id'), nullable=False),
    sa.Column('name', sa.String(255), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
)
op.create_index('ix_my_table_seller_id', 'my_table', ['seller_id'])
```

### Rename column
```python
op.alter_column('table', 'old_name', new_column_name='new_name')
```

### Add enum value (PostgreSQL)
```python
op.execute("ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'new_status'")
```

## Model Location

All SQLAlchemy models are in `backend/app/models/`:
- `user.py`, `seller.py`, `product.py`, `order.py`, `cart.py`
- `delivery_zone.py` (City, District, Metro)
- `commission_ledger.py`, `subscription.py`, `crm.py`
- `settings.py`, `refresh_token.py`

## Reference

- Config: `backend/alembic.ini`
- Migrations: `backend/migrations/versions/`
- Models: `backend/app/models/`

Read the last 3-5 migrations in `backend/migrations/versions/` to see the current style.
