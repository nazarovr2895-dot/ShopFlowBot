from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.app.core.config import DB_URL
from backend.app.core.base import Base  # noqa: F401 - re-exported for compatibility

engine = create_async_engine(
    url=DB_URL,
    echo=False,  # Отключено для production
    pool_size=20,  # Базовый размер пула соединений
    max_overflow=30,  # Дополнительные соединения при пиковой нагрузке
    pool_pre_ping=True,  # Проверка соединения перед использованием
    pool_recycle=3600,  # Пересоздание соединений каждый час
)
async_session = async_sessionmaker(engine, expire_on_commit=False)