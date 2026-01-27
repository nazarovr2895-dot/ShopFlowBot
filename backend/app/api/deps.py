from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.database import async_session
from backend.app.services.cache import CacheService


# Эта функция выдает сессию базы данных для каждого запроса
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session


# Эта функция выдает сервис кэширования для каждого запроса
async def get_cache() -> AsyncGenerator[CacheService, None]:
    redis = await CacheService.get_redis()
    yield CacheService(redis)