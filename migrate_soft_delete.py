"""
Migration script to add soft delete support for sellers.
Adds 'deleted_at' column to the sellers table.

Run this script once to migrate an existing database:
    python migrate_soft_delete.py
"""
import asyncio
from sqlalchemy import text
from backend.app.core.database import engine


async def migrate():
    print("🔄 Applying soft delete migration...")
    
    async with engine.begin() as conn:
        # Check if column already exists
        result = await conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'sellers' AND column_name = 'deleted_at'
        """))
        
        if result.fetchone():
            print("✅ Column 'deleted_at' already exists. Nothing to do.")
            return
        
        # Add the new column
        await conn.execute(text("""
            ALTER TABLE sellers 
            ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL
        """))
        
        print("✅ Column 'deleted_at' added to sellers table.")
        print("✅ Migration completed successfully!")


if __name__ == "__main__":
    asyncio.run(migrate())
