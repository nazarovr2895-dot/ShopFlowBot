"""Модель заявки на подключение продавца."""

from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.core.base import Base


class SellerApplication(Base):
    __tablename__ = "seller_applications"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    shop_name: Mapped[str] = mapped_column(String(255))
    inn: Mapped[str] = mapped_column(String(12))
    phone: Mapped[str] = mapped_column(String(20))
    # Данные из DaData
    org_name: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    org_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # LEGAL / INDIVIDUAL
    ogrn: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    management_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    org_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Статус заявки
    status: Mapped[str] = mapped_column(String(20), default="new")  # new / approved / rejected
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_seller_applications_status", "status"),
        Index("ix_seller_applications_inn", "inn"),
    )
