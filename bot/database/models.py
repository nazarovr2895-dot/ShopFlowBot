import os
from sqlalchemy import BigInteger, String, ForeignKey, DateTime, DECIMAL, Text, Boolean, Integer
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.ext.asyncio import AsyncAttrs, async_sessionmaker, create_async_engine
from datetime import datetime
from bot.config import DB_URL

# Connection pool configuration for bot
# Use smaller pool for bot as it has less concurrent load
BOT_POOL_SIZE = int(os.getenv("BOT_POOL_SIZE", "10"))
BOT_MAX_OVERFLOW = int(os.getenv("BOT_MAX_OVERFLOW", "20"))

# Добавили expire_on_commit=False для стабильной работы
# Configure connection pool for better performance
engine = create_async_engine(
    url=DB_URL,
    echo=False,  # Disable SQL echo in production
    pool_size=BOT_POOL_SIZE,
    max_overflow=BOT_MAX_OVERFLOW,
    pool_pre_ping=True,
    pool_recycle=3600,
)
async_session = async_sessionmaker(engine, expire_on_commit=False)

class Base(AsyncAttrs, DeclarativeBase):
    pass

class GlobalSettings(Base):
    __tablename__ = 'settings'
    id: Mapped[int] = mapped_column(primary_key=True)
    commission_percent: Mapped[int] = mapped_column(Integer, default=18)

class City(Base):
    __tablename__ = 'cities'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))

class District(Base):
    __tablename__ = 'districts'
    id: Mapped[int] = mapped_column(primary_key=True)
    city_id: Mapped[int] = mapped_column(ForeignKey('cities.id'))
    name: Mapped[str] = mapped_column(String(100))

class Metro(Base):
    __tablename__ = 'metro_stations'
    id: Mapped[int] = mapped_column(primary_key=True)
    district_id: Mapped[int] = mapped_column(ForeignKey('districts.id'))
    name: Mapped[str] = mapped_column(String(100))
    line_color: Mapped[str] = mapped_column(String(7), nullable=True)  # HEX, e.g. "#FF0000"

class User(Base):
    __tablename__ = 'users'
    tg_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    username: Mapped[str] = mapped_column(String(255), nullable=True)
    fio: Mapped[str] = mapped_column(String(255), nullable=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default='BUYER')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

class Seller(Base):
    __tablename__ = 'sellers'
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'), primary_key=True)
    shop_name: Mapped[str] = mapped_column(String(255), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    city_id: Mapped[int] = mapped_column(ForeignKey('cities.id'), nullable=True)
    district_id: Mapped[int] = mapped_column(ForeignKey('districts.id'), nullable=True)
    metro_id: Mapped[int] = mapped_column(ForeignKey('metro_stations.id'), nullable=True)
    metro_walk_minutes: Mapped[int] = mapped_column(Integer, nullable=True)
    map_url: Mapped[str] = mapped_column(Text, nullable=True)
    delivery_type: Mapped[str] = mapped_column(String(100), nullable=True)
    delivery_price: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0.0)
    max_orders: Mapped[int] = mapped_column(Integer, default=0)
    active_orders: Mapped[int] = mapped_column(Integer, default=0)
    pending_requests: Mapped[int] = mapped_column(Integer, default=0)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    placement_expired_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

class Product(Base):
    __tablename__ = 'products'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'))
    name: Mapped[str] = mapped_column(String(255))
    price: Mapped[float] = mapped_column(DECIMAL(10, 2))
    description: Mapped[str] = mapped_column(Text, nullable=True)
    photo_id: Mapped[str] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0)

class Order(Base):
    __tablename__ = 'orders'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    buyer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'))
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'))
    agent_id: Mapped[int] = mapped_column(BigInteger, nullable=True)
    items_info: Mapped[str] = mapped_column(Text)
    total_price: Mapped[float] = mapped_column(DECIMAL(10, 2))
    status: Mapped[str] = mapped_column(String(50), default='pending')
    delivery_type: Mapped[str] = mapped_column(String(50), nullable=True)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

async def db_main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)