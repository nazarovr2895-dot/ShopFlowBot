from sqlalchemy import BigInteger, String, ForeignKey, Text, Boolean, Integer, DateTime, Date, Index, DECIMAL, JSON
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, date
from typing import Optional, List
from backend.app.core.base import Base


class Seller(Base):
    __tablename__ = 'sellers'
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'), primary_key=True)
    shop_name: Mapped[str] = mapped_column(String(255), nullable=True)
    inn: Mapped[Optional[str]] = mapped_column(String(12), nullable=True)  # ИНН: 10 цифр для юрлиц, 12 для ИП
    hashtags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # comma-separated, e.g. "101 роза, тюльпаны, гвоздики"
    description: Mapped[str] = mapped_column(Text, nullable=True)
    city_id: Mapped[int] = mapped_column(ForeignKey('cities.id'), nullable=True)
    district_id: Mapped[int] = mapped_column(ForeignKey('districts.id'), nullable=True)
    metro_id: Mapped[int] = mapped_column(ForeignKey('metro_stations.id'), nullable=True)
    metro_walk_minutes: Mapped[int] = mapped_column(Integer, nullable=True)
    map_url: Mapped[str] = mapped_column(Text, nullable=True)
    delivery_type: Mapped[str] = mapped_column(String(100), nullable=True)
    delivery_price: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0.0)
    max_orders: Mapped[int] = mapped_column(Integer, default=0)
    daily_limit_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    active_orders: Mapped[int] = mapped_column(Integer, default=0)
    pending_requests: Mapped[int] = mapped_column(Integer, default=0)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    placement_expired_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    deleted_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)  # Soft delete timestamp
    # Web panel auth (login/password for seller web access)
    web_login: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True)
    web_password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Loyalty / club card: percent of purchase amount accrued as points (e.g. 5.00 = 5%)
    loyalty_points_percent: Mapped[float] = mapped_column(DECIMAL(5, 2), default=0)
    # Preorder schedule
    preorder_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    preorder_schedule_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # 'weekly' | 'interval_days' | 'custom_dates'
    preorder_weekday: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 0=Mon, 6=Sun
    preorder_interval_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    preorder_base_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # Temporarily commented out until migration is applied - uncomment after running: alembic upgrade head
    preorder_custom_dates: Mapped[Optional[List[str]]] = mapped_column(JSON(), nullable=True)  # List of YYYY-MM-DD dates
    # Shop banner (YouTube-style), path like /static/uploads/shop_banners/123.webp
    banner_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    __table_args__ = (
        Index('ix_sellers_city_id', 'city_id'),
        Index('ix_sellers_district_id', 'district_id'),
        Index('ix_sellers_is_blocked', 'is_blocked'),
        Index('ix_sellers_deleted_at', 'deleted_at'),
        Index('ix_sellers_inn', 'inn'),
    )

class City(Base):
    __tablename__ = 'cities'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))

class District(Base):
    __tablename__ = 'districts'
    id: Mapped[int] = mapped_column(primary_key=True)
    city_id: Mapped[int] = mapped_column(ForeignKey('cities.id'))
    name: Mapped[str] = mapped_column(String(100))

    __table_args__ = (
        Index('ix_districts_city_id', 'city_id'),
    )

class Metro(Base):
    __tablename__ = 'metro_stations'
    id: Mapped[int] = mapped_column(primary_key=True)
    district_id: Mapped[int] = mapped_column(ForeignKey('districts.id'))
    name: Mapped[str] = mapped_column(String(100))
    line_color: Mapped[str] = mapped_column(String(7), nullable=True)  # HEX, e.g. "#FF0000"

    __table_args__ = (
        Index('ix_metro_stations_district_id', 'district_id'),
    )