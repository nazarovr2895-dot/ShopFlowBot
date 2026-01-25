from sqlalchemy import BigInteger, String, ForeignKey, Text, Boolean, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from backend.app.core.database import Base


class Seller(Base):
    __tablename__ = 'sellers'
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'), primary_key=True)
    shop_name: Mapped[str] = mapped_column(String(255), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    city_id: Mapped[int] = mapped_column(ForeignKey('cities.id'), nullable=True)
    district_id: Mapped[int] = mapped_column(ForeignKey('districts.id'), nullable=True)
    metro_id: Mapped[int] = mapped_column(ForeignKey('metro_stations.id'), nullable=True)
    map_url: Mapped[str] = mapped_column(Text, nullable=True)
    delivery_type: Mapped[str] = mapped_column(String(100), nullable=True)
    max_orders: Mapped[int] = mapped_column(Integer, default=10)
    active_orders: Mapped[int] = mapped_column(Integer, default=0)
    pending_requests: Mapped[int] = mapped_column(Integer, default=0)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    placement_expired_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

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