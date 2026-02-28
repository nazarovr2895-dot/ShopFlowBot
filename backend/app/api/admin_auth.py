"""Admin login endpoint - no auth required."""
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.limiter import limiter
from backend.app.core.auth import validate_telegram_data_with_token
from backend.app.api.deps import get_session
from backend.app.api.seller_auth import create_seller_token, BranchInfo
from backend.app.models.seller import Seller

router = APIRouter()

# Require environment variables - no defaults in production
ADMIN_LOGIN = os.getenv("ADMIN_LOGIN")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
ADMIN_SECRET = os.getenv("ADMIN_SECRET")

# Validate required configuration
if not ADMIN_LOGIN or not ADMIN_PASSWORD or not ADMIN_SECRET:
    import sys
    print("ERROR: ADMIN_LOGIN, ADMIN_PASSWORD, and ADMIN_SECRET must be set in environment variables", file=sys.stderr)
    sys.exit(1)

# Admin bot token (optional — only needed for Telegram Mini App auth)
ADMIN_BOT_TOKEN = os.getenv("ADMIN_BOT_TOKEN")
MASTER_ADMIN_ID = int(os.getenv("MASTER_ADMIN_ID", "0"))

# Rate limit uses app.state.limiter (set in main.py); same limiter instance from core.limiter


class LoginRequest(BaseModel):
    login: str
    password: str


class TelegramAuthRequest(BaseModel):
    init_data: str


class TelegramAuthResponse(BaseModel):
    token: str
    role: str
    seller_id: Optional[int] = None
    owner_id: Optional[int] = None
    branches: list[BranchInfo] = []


@router.post("/login")
@limiter.limit("5/minute")
async def admin_login(request: Request, data: LoginRequest):
    """Проверка логина и пароля, возврат токена для API.

    Rate limited to 5 attempts per minute per IP address.
    """
    if data.login != ADMIN_LOGIN or data.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    return {"token": ADMIN_SECRET}


@router.post("/auth/telegram", response_model=TelegramAuthResponse)
@limiter.limit("10/minute")
async def admin_telegram_auth(
    request: Request,
    data: TelegramAuthRequest,
    session: AsyncSession = Depends(get_session),
):
    """Авторизация админа/продавца через Telegram Mini App initData.

    Валидирует initData с помощью ADMIN_BOT_TOKEN (второй бот).
    Возвращает соответствующий токен в зависимости от роли пользователя.
    """
    if not ADMIN_BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Admin bot не настроен")

    # Validate initData with admin bot token
    init_data = validate_telegram_data_with_token(data.init_data, ADMIN_BOT_TOKEN)
    tg_id = init_data.user.id

    # Check if user is the master admin
    if MASTER_ADMIN_ID and tg_id == MASTER_ADMIN_ID:
        return TelegramAuthResponse(token=ADMIN_SECRET, role="admin")

    # Check if user is a seller (owner of any branches)
    result = await session.execute(
        select(Seller).where(
            Seller.owner_id == tg_id,
            Seller.deleted_at.is_(None),
        ).order_by(Seller.seller_id)
    )
    sellers = result.scalars().all()
    if sellers:
        # Use first (primary) branch
        primary = sellers[0]
        if primary.is_blocked:
            raise HTTPException(status_code=403, detail="Аккаунт заблокирован")
        token = create_seller_token(primary.seller_id, primary.owner_id)
        branches = [
            BranchInfo(seller_id=s.seller_id, shop_name=s.shop_name, address_name=s.address_name)
            for s in sellers
        ]
        return TelegramAuthResponse(
            token=token, role="seller",
            seller_id=primary.seller_id,
            owner_id=primary.owner_id,
            branches=branches,
        )

    raise HTTPException(status_code=403, detail="Доступ запрещён: вы не являетесь админом или продавцом")
