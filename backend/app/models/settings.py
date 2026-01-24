from sqlalchemy import Integer
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.core.database import Base

class GlobalSettings(Base):
    __tablename__ = 'settings'
    id: Mapped[int] = mapped_column(primary_key=True)
    commission_percent: Mapped[int] = mapped_column(Integer, default=18)