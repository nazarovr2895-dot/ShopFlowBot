from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.database import async_session

# Эта функция выдает сессию базы данных для каждого запроса
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session