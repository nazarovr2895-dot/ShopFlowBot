"""
Read replica support for database queries.
Allows routing read-only queries to read replicas for better performance.
"""
import os
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from backend.app.core.config import DB_URL

# Read replica URL (optional, falls back to main DB if not set)
DB_READ_REPLICA_URL = os.getenv("DB_READ_REPLICA_URL")

# Create read replica engine if configured
if DB_READ_REPLICA_URL:
    read_replica_engine = create_async_engine(
        url=DB_READ_REPLICA_URL,
        echo=False,
        pool_size=int(os.getenv("DB_POOL_SIZE", "50")),
        max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "100")),
        pool_pre_ping=True,
        pool_recycle=3600,
        pool_timeout=30,
    )
    read_replica_session = async_sessionmaker(read_replica_engine, expire_on_commit=False)
else:
    # Fallback to main database if no read replica configured
    from backend.app.core.database import engine, async_session
    read_replica_engine = engine
    read_replica_session = async_session


def get_read_session():
    """
    Get a session for read-only queries.
    Uses read replica if configured, otherwise uses main database.
    """
    return read_replica_session()
