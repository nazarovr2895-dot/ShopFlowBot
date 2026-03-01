"""Add full-text search with Russian morphology, replace hashtags

Revision ID: add_fts_search
Revises: add_max_branches
Create Date: 2026-03-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_fts_search'
down_revision: Union[str, None] = 'add_max_branches'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Enable pg_trgm extension for typo tolerance
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # 2. Add tsvector columns
    op.execute(
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector tsvector"
    )
    op.execute(
        "ALTER TABLE sellers ADD COLUMN IF NOT EXISTS search_vector tsvector"
    )

    # 3. Populate search_vector for existing records
    op.execute("""
        UPDATE products SET search_vector =
            setweight(to_tsvector('russian', coalesce(name, '')), 'A') ||
            setweight(to_tsvector('russian', coalesce(description, '')), 'B')
    """)
    op.execute("""
        UPDATE sellers SET search_vector =
            setweight(to_tsvector('russian', coalesce(shop_name, '')), 'A') ||
            setweight(to_tsvector('russian', coalesce(description, '')), 'C')
    """)

    # 4. GIN indexes for full-text search
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_products_search_vector
        ON products USING GIN (search_vector)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_sellers_search_vector
        ON sellers USING GIN (search_vector)
    """)

    # 5. Trigram GIN indexes for fuzzy matching (typo tolerance)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_products_name_trgm
        ON products USING GIN (name gin_trgm_ops)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_sellers_shop_name_trgm
        ON sellers USING GIN (shop_name gin_trgm_ops)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_categories_name_trgm
        ON categories USING GIN (name gin_trgm_ops)
    """)

    # 6. Triggers to auto-update search_vector on INSERT/UPDATE
    op.execute("""
        CREATE OR REPLACE FUNCTION products_search_vector_update() RETURNS trigger AS $$
        BEGIN
            NEW.search_vector :=
                setweight(to_tsvector('russian', coalesce(NEW.name, '')), 'A') ||
                setweight(to_tsvector('russian', coalesce(NEW.description, '')), 'B');
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        DROP TRIGGER IF EXISTS trg_products_search_vector ON products;
        CREATE TRIGGER trg_products_search_vector
        BEFORE INSERT OR UPDATE OF name, description ON products
        FOR EACH ROW EXECUTE FUNCTION products_search_vector_update();
    """)

    op.execute("""
        CREATE OR REPLACE FUNCTION sellers_search_vector_update() RETURNS trigger AS $$
        BEGIN
            NEW.search_vector :=
                setweight(to_tsvector('russian', coalesce(NEW.shop_name, '')), 'A') ||
                setweight(to_tsvector('russian', coalesce(NEW.description, '')), 'C');
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        DROP TRIGGER IF EXISTS trg_sellers_search_vector ON sellers;
        CREATE TRIGGER trg_sellers_search_vector
        BEFORE INSERT OR UPDATE OF shop_name, description ON sellers
        FOR EACH ROW EXECUTE FUNCTION sellers_search_vector_update();
    """)

    # 7. Drop hashtags column (replaced by FTS)
    op.drop_column('sellers', 'hashtags')


def downgrade() -> None:
    # Restore hashtags column
    op.add_column('sellers', sa.Column('hashtags', sa.Text(), nullable=True))

    # Drop triggers
    op.execute("DROP TRIGGER IF EXISTS trg_sellers_search_vector ON sellers")
    op.execute("DROP FUNCTION IF EXISTS sellers_search_vector_update()")
    op.execute("DROP TRIGGER IF EXISTS trg_products_search_vector ON products")
    op.execute("DROP FUNCTION IF EXISTS products_search_vector_update()")

    # Drop trigram indexes
    op.execute("DROP INDEX IF EXISTS ix_categories_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_sellers_shop_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_products_name_trgm")

    # Drop FTS indexes
    op.execute("DROP INDEX IF EXISTS ix_sellers_search_vector")
    op.execute("DROP INDEX IF EXISTS ix_products_search_vector")

    # Drop tsvector columns
    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS search_vector")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS search_vector")
