"""Seller web panel authentication."""
import os
import sys
from datetime import datetime, timedelta
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.limiter import limiter

from backend.app.api.deps import get_session
from backend.app.core.password_utils import verify_password
from backend.app.models.seller import Seller
from backend.app.models.user import User

router = APIRouter()

# Require JWT_SECRET - no default in production
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    # Fallback to ADMIN_SECRET only if explicitly set
    JWT_SECRET = os.getenv("ADMIN_SECRET")
    if not JWT_SECRET:
        print("ERROR: JWT_SECRET or ADMIN_SECRET must be set in environment variables", file=sys.stderr)
        sys.exit(1)

JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24 * 7  # 7 days

# Rate limit uses app.state.limiter (set in main.py); exception handler in main.py


class SellerLoginRequest(BaseModel):
    login: str
    password: str


class SellerLoginResponse(BaseModel):
    token: str
    role: str = "seller"
    seller_id: int


def create_seller_token(seller_id: int) -> str:
    """Create JWT for seller web session."""
    payload = {
        "sub": str(seller_id),
        "role": "seller",
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_seller_token(token: str) -> Optional[int]:
    """Decode JWT and return seller_id or None."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("role") != "seller":
            return None
        return int(payload["sub"])
    except (jwt.InvalidTokenError, ValueError, KeyError):
        return None


async def require_seller_token(
    x_seller_token: Optional[str] = Header(None, alias="X-Seller-Token"),
    session: AsyncSession = Depends(get_session),
) -> int:
    """Dependency: require valid seller token, return seller_id."""
    if not x_seller_token:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    seller_id = decode_seller_token(x_seller_token)
    if not seller_id:
        raise HTTPException(status_code=401, detail="Недействительный или истекший токен")
    # Verify seller exists and is not deleted
    result = await session.execute(
        select(Seller).where(
            Seller.seller_id == seller_id,
            Seller.deleted_at.is_(None),
        )
    )
    seller = result.scalar_one_or_none()
    if not seller:
        raise HTTPException(status_code=401, detail="Продавец не найден")
    if seller.is_blocked:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")
    return seller_id


@router.post("/login", response_model=SellerLoginResponse)
@limiter.limit("5/minute")
async def seller_login(
    request: Request,
    data: SellerLoginRequest,
    session: AsyncSession = Depends(get_session),
):
    """Seller login for web panel.
    
    Rate limited to 5 attempts per minute per IP address.
    """
    result = await session.execute(
        select(Seller, User).join(User, User.tg_id == Seller.seller_id).where(
            Seller.web_login == data.login,
            Seller.deleted_at.is_(None),
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    seller, user = row
    if not seller.web_password_hash or not verify_password(data.password, seller.web_password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    if seller.is_blocked:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")
    token = create_seller_token(seller.seller_id)
    return SellerLoginResponse(token=token, seller_id=seller.seller_id)
