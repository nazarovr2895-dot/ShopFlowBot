"""Refresh token model for token rotation and revocation."""
from datetime import datetime
from typing import Optional

from sqlalchemy import Integer, String, DateTime, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.core.base import Base


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    user_type: Mapped[str] = mapped_column(String(10), nullable=False)  # 'buyer' or 'seller'
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    owner_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True)
    device_info: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    replaced_by_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    __table_args__ = (
        Index("ix_refresh_tokens_token_hash", "token_hash"),
        Index("ix_refresh_tokens_user", "user_type", "user_id"),
        Index("ix_refresh_tokens_expires_at", "expires_at"),
    )
