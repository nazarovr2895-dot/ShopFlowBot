import os
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.app.core.config import DB_URL
from backend.app.core.base import Base  # noqa: F401 - re-exported for compatibility

# Connection pool configuration for production scalability
# For 10K concurrent users, we need larger pools
# These can be overridden via environment variables
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "50"))  # Base pool size
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "100"))  # Additional connections under load
DB_POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "3600"))  # Recycle connections every hour

engine = create_async_engine(
    url=DB_URL,
    echo=False,  # Отключено для production
    pool_size=DB_POOL_SIZE,  # Базовый размер пула соединений (увеличено для масштабирования)
    max_overflow=DB_MAX_OVERFLOW,  # Дополнительные соединения при пиковой нагрузке
    pool_pre_ping=True,  # Проверка соединения перед использованием
    pool_recycle=DB_POOL_RECYCLE,  # Пересоздание соединений каждый час
    pool_timeout=30,  # Timeout для получения соединения из пула
)
async_session = async_sessionmaker(engine, expire_on_commit=False)