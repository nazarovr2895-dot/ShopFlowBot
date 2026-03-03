"""
Authentication endpoints for hybrid Telegram Mini App / Browser authentication.

Supports:
1. Telegram Mini App - initData validation
2. Browser - Telegram Widget authentication
"""
import hmac
import hashlib
import json
import os
import time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_session
from backend.app.core.auth import (
    validate_telegram_data,
    create_user_jwt,
    TelegramInitData,
    BOT_TOKEN,
    MAX_DATA_AGE,
)
from backend.app.core.limiter import limiter
from backend.app.services.buyers import BuyerService

router = APIRouter()


class MiniAppAuthRequest(BaseModel):
    """Request for Telegram Mini App authentication"""
    init_data: str


class WidgetAuthRequest(BaseModel):
    """Request for Telegram Widget authentication"""
    id: int
    first_name: str
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    auth_date: int
    hash: str


class AuthResponse(BaseModel):
    """Response with JWT token"""
    token: str
    refresh_token: Optional[str] = None
    telegram_id: int
    username: Optional[str] = None
    first_name: str


def validate_widget_data(data: WidgetAuthRequest) -> bool:
    """
    Validate Telegram Widget authentication data.

    According to Telegram Widget documentation:
    https://core.telegram.org/widgets/login

    Args:
        data: Widget authentication data

    Returns:
        True if valid

    Raises:
        HTTPException: If validation fails
    """
    if not BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Server configuration error: BOT_TOKEN not set")

    # Check auth_date to prevent replay attacks
    current_time = int(time.time())
    if current_time - data.auth_date > MAX_DATA_AGE:
        raise HTTPException(status_code=401, detail="Auth data has expired")

    # Create data-check-string
    # Format: key=value\nkey=value (sorted alphabetically, excluding hash)
    data_dict = {
        "id": str(data.id),
        "first_name": data.first_name,
        "auth_date": str(data.auth_date),
    }

    if data.last_name:
        data_dict["last_name"] = data.last_name
    if data.username:
        data_dict["username"] = data.username
    if data.photo_url:
        data_dict["photo_url"] = data.photo_url

    # Sort and create data-check-string
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(data_dict.items())
    )

    # Create secret key: SHA256(bot_token) — per Login Widget docs
    # https://core.telegram.org/widgets/login#checking-authorization
    secret_key = hashlib.sha256(BOT_TOKEN.encode("utf-8")).digest()

    # Calculate hash: HMAC_SHA256(data_check_string, secret_key)
    calculated_hash = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

    # Verify hash
    if not hmac.compare_digest(calculated_hash, data.hash):
        raise HTTPException(status_code=401, detail="Invalid Telegram signature")

    return True


async def _create_or_update_buyer(
    session: AsyncSession,
    telegram_id: int,
    username: Optional[str],
    first_name: str,
):
    """Shared logic for creating/updating a buyer and returning tokens."""
    service = BuyerService(session)
    user = await service.get_buyer(telegram_id)

    if not user:
        user = await service.register_buyer(
            tg_id=telegram_id,
            username=username,
            fio=first_name
        )
    else:
        update_fields = {}
        if username and user.username != username:
            update_fields["username"] = username
        if first_name and user.fio != first_name:
            update_fields["fio"] = first_name
        if update_fields:
            await service.update_profile(telegram_id, **update_fields)

    token = create_user_jwt(telegram_id)

    from backend.app.services.token_service import create_refresh_token
    refresh = await create_refresh_token(
        session,
        user_type="buyer",
        user_id=str(telegram_id),
    )
    await session.commit()

    return AuthResponse(
        token=token,
        refresh_token=refresh,
        telegram_id=telegram_id,
        username=username,
        first_name=first_name
    )


@router.post("/telegram-mini-app", response_model=AuthResponse)
@limiter.limit("10/minute")
async def auth_telegram_mini_app(
    request: Request,
    data: MiniAppAuthRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Authenticate using Telegram Mini App initData.

    Validates initData, creates/updates user in database, returns JWT token.
    """
    try:
        init_data = validate_telegram_data(data.init_data)
    except HTTPException as e:
        raise e

    return await _create_or_update_buyer(
        session, init_data.user.id, init_data.user.username, init_data.user.first_name
    )


@router.post("/telegram-widget", response_model=AuthResponse)
@limiter.limit("10/minute")
async def auth_telegram_widget(
    request: Request,
    data: WidgetAuthRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Authenticate using Telegram Widget data (for browser).

    Validates widget data, creates/updates user in database, returns JWT token.
    """
    try:
        validate_widget_data(data)
    except HTTPException as e:
        raise e

    return await _create_or_update_buyer(
        session, data.id, data.username, data.first_name
    )


class BuyerRefreshRequest(BaseModel):
    refresh_token: str


class BuyerRefreshResponse(BaseModel):
    token: str
    refresh_token: str


class BuyerLogoutRequest(BaseModel):
    refresh_token: str


@router.post("/refresh", response_model=BuyerRefreshResponse)
@limiter.limit("10/minute")
async def buyer_refresh(
    request: Request,
    data: BuyerRefreshRequest,
    session: AsyncSession = Depends(get_session),
):
    """Refresh buyer token pair using refresh token."""
    from backend.app.services.token_service import validate_and_rotate_refresh_token

    result = await validate_and_rotate_refresh_token(session, data.refresh_token)
    if not result:
        raise HTTPException(status_code=401, detail="Недействительный refresh token")

    old_record, new_refresh = result
    if old_record.user_type != "buyer":
        raise HTTPException(status_code=401, detail="Недействительный refresh token")

    telegram_id = int(old_record.user_id)
    access_token = create_user_jwt(telegram_id)
    await session.commit()
    return BuyerRefreshResponse(token=access_token, refresh_token=new_refresh)


@router.post("/logout")
@limiter.limit("10/minute")
async def buyer_logout(
    request: Request,
    data: BuyerLogoutRequest,
    session: AsyncSession = Depends(get_session),
):
    """Revoke refresh token on logout."""
    from backend.app.services.token_service import revoke_token
    await revoke_token(session, data.refresh_token)
    await session.commit()
    return {"status": "ok"}
