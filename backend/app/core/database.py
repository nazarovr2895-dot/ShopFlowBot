from sqlalchemy.ext.asyncio import AsyncAttrs, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
# Мы потом поправим путь к конфигу, пока оставляем логику
from backend.app.core.config import DB_URL 

engine = create_async_engine(url=DB_URL, echo=True)
async_session = async_sessionmaker(engine, expire_on_commit=False)

class Base(AsyncAttrs, DeclarativeBase):
    pass