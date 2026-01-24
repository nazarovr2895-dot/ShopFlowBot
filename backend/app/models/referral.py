from sqlalchemy import BigInteger, ForeignKey, DateTime, Integer, DECIMAL
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from backend.app.core.database import Base

class Referral(Base):
    __tablename__ = 'referrals'
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Кто пригласил (Агент)
    referrer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'))
    
    # Кого пригласили (Новый пользователь)
    referred_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'), unique=True)
    
    # Общая сумма заработанных бонусов с этого реферала (опционально)
    total_earned: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0.0)
    
    # Дата создания связи (привязка навсегда)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)