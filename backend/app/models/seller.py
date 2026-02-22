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
    ogrn: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)  # ОГРН: 13 цифр для юрлиц, 15 для ИП
    hashtags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # comma-separated, e.g. "101 роза, тюльпаны, гвоздики"
    description: Mapped[str] = mapped_column(Text, nullable=True)
    city_id: Mapped[int] = mapped_column(ForeignKey('cities.id'), nullable=True)
    district_id: Mapped[int] = mapped_column(ForeignKey('districts.id'), nullable=True)
    metro_id: Mapped[int] = mapped_column(ForeignKey('metro_stations.id'), nullable=True)
    metro_walk_minutes: Mapped[int] = mapped_column(Integer, nullable=True)
    address_name: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    map_url: Mapped[str] = mapped_column(Text, nullable=True)
    delivery_type: Mapped[str] = mapped_column(String(100), nullable=True)
    delivery_price: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0.0)
    max_orders: Mapped[int] = mapped_column(Integer, default=0)
    default_daily_limit: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Стандартный дневной лимит (авто-применяется, если daily_limit_date != сегодня)
    daily_limit_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    active_orders: Mapped[int] = mapped_column(Integer, default=0)
    pending_requests: Mapped[int] = mapped_column(Integer, default=0)
    # Split limits by delivery type
    max_delivery_orders: Mapped[int] = mapped_column(Integer, default=10)
    max_pickup_orders: Mapped[int] = mapped_column(Integer, default=20)
    active_delivery_orders: Mapped[int] = mapped_column(Integer, default=0)
    active_pickup_orders: Mapped[int] = mapped_column(Integer, default=0)
    pending_delivery_requests: Mapped[int] = mapped_column(Integer, default=0)
    pending_pickup_requests: Mapped[int] = mapped_column(Integer, default=0)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    placement_expired_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    deleted_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)  # Soft delete timestamp
    # Web panel auth (login/password for seller web access)
    web_login: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True)
    web_password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Loyalty / club card: percent of purchase amount accrued as points (e.g. 5.00 = 5%)
    loyalty_points_percent: Mapped[float] = mapped_column(DECIMAL(5, 2), default=0)
    # Max % of order that can be paid with points (e.g. 50 = 50%), default 100
    max_points_discount_percent: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=100)
    # Points to ruble rate (e.g. 1.0 = 1 point = 1 ruble), default 1.0
    points_to_ruble_rate: Mapped[Optional[float]] = mapped_column(DECIMAL(5, 2), nullable=True, default=1)
    # Preorder schedule
    preorder_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    preorder_schedule_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # 'weekly' | 'interval_days' | 'custom_dates'
    preorder_weekday: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 0=Mon, 6=Sun
    preorder_interval_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    preorder_base_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    preorder_custom_dates: Mapped[Optional[List[str]]] = mapped_column(JSON(), nullable=True)  # List of YYYY-MM-DD dates
    preorder_min_lead_days: Mapped[int] = mapped_column(Integer, default=2)  # Min days before preorder date
    preorder_max_per_date: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Max preorders per delivery date (null=unlimited)
    # Early bird discount for preorders placed N+ days in advance
    preorder_discount_percent: Mapped[float] = mapped_column(DECIMAL(5, 2), default=0)  # e.g. 10.00 = 10%
    preorder_discount_min_days: Mapped[int] = mapped_column(Integer, default=7)  # Min days ahead for discount
    # Loyalty tiers config: [{"name": "Бронза", "min_total": 0, "points_percent": 3}, ...]
    loyalty_tiers_config: Mapped[Optional[list]] = mapped_column(JSON(), nullable=True)
    # Points expire after N days (null = never expire)
    points_expire_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Subscription plan: free / pro / premium (determines max limit cap)
    subscription_plan: Mapped[str] = mapped_column(String(20), default='free')
    # Per-seller commission override (null = use global setting from GlobalSettings)
    commission_percent: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=None)
    # YuKassa marketplace account ID (assigned after seller onboarding at YuKassa)
    yookassa_account_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Weekly limit schedule: JSON {"0": 10, "1": 10, ..., "6": 5} (0=Mon, 6=Sun), null = use default_daily_limit
    weekly_schedule: Mapped[Optional[dict]] = mapped_column(JSON(), nullable=True)
    # Shop banner (YouTube-style), path like /static/uploads/shop_banners/123.webp
    banner_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    # Working hours: JSON {"0": {"open": "09:00", "close": "18:00"}, "5": null, ...}
    # Keys: "0"=Mon, "6"=Sun. null = day off. If working_hours is null, no restrictions.
    working_hours: Mapped[Optional[dict]] = mapped_column(JSON(), nullable=True)

    __table_args__ = (
        Index('ix_sellers_city_id', 'city_id'),
        Index('ix_sellers_district_id', 'district_id'),
        Index('ix_sellers_is_blocked', 'is_blocked'),
        Index('ix_sellers_deleted_at', 'deleted_at'),
        Index('ix_sellers_inn', 'inn'),
        Index('ix_sellers_ogrn', 'ogrn'),
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