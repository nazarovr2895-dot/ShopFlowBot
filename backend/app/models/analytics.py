"""Analytics models — page views tracking and daily aggregated stats."""
from sqlalchemy import BigInteger, Integer, String, DateTime, Date, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, date as date_type
from typing import Optional
from backend.app.core.base import Base


class PageView(Base):
    """Raw page view event from Mini App."""
    __tablename__ = 'page_views'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    visitor_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    session_id: Mapped[str] = mapped_column(String(64), nullable=False)
    event_type: Mapped[str] = mapped_column(String(20), nullable=False)
    seller_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    product_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('ix_page_views_created_at', 'created_at'),
        Index('ix_page_views_event_created', 'event_type', 'created_at'),
        Index('ix_page_views_seller_created', 'seller_id', 'created_at'),
        Index('ix_page_views_product_created', 'product_id', 'created_at'),
    )


class DailyStats(Base):
    """Pre-aggregated daily statistics, rolled up from page_views hourly."""
    __tablename__ = 'daily_stats'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    seller_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    unique_visitors: Mapped[int] = mapped_column(Integer, default=0)
    total_views: Mapped[int] = mapped_column(Integer, default=0)
    shop_views: Mapped[int] = mapped_column(Integer, default=0)
    product_views: Mapped[int] = mapped_column(Integer, default=0)
    orders_placed: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        UniqueConstraint('date', 'seller_id', name='uq_daily_stats_date_seller'),
        Index('ix_daily_stats_date', 'date'),
        Index('ix_daily_stats_seller_date', 'seller_id', 'date'),
    )
