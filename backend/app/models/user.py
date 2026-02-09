from sqlalchemy import BigInteger, String, DateTime, ForeignKey, DECIMAL, Integer, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from backend.app.core.base import Base

class User(Base):
    __tablename__ = 'users'
    
    tg_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    username: Mapped[str] = mapped_column(String(255), nullable=True)
    fio: Mapped[str] = mapped_column(String(255), nullable=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default='BUYER')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    # Реферальная система
    referrer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'), nullable=True)
    balance: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0)

    # --- ПОЛЯ ДЛЯ ЛОКАЦИИ ---
    city_id: Mapped[int] = mapped_column(ForeignKey('cities.id'), nullable=True)
    district_id: Mapped[int] = mapped_column(ForeignKey('districts.id'), nullable=True)

    __table_args__ = (
        Index('ix_users_referrer_id', 'referrer_id'),
        Index('ix_users_role', 'role'),
    )