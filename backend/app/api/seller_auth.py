"""Seller web panel authentication."""
import os
import sys
from datetime import datetime, timedelta
from typing import Optional, Tuple

import jwt
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from pydantic import BaseModel
from sqlalchemy import select, func
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


class BranchInfo(BaseModel):
    seller_id: int
    shop_name: Optional[str] = None
    address_name: Optional[str] = None


class SellerLoginResponse(BaseModel):
    token: str
    role: str = "seller"
    seller_id: int
    owner_id: int
    is_primary: bool = True
    branches: list[BranchInfo] = []


class SwitchBranchRequest(BaseModel):
    seller_id: int


class SwitchBranchResponse(BaseModel):
    token: str
    seller_id: int


def create_seller_token(seller_id: int, owner_id: int, is_primary: bool = True) -> str:
    """Create JWT for seller web session."""
    payload = {
        "sub": str(seller_id),
        "owner": str(owner_id),
        "role": "seller",
        "is_primary": is_primary,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_seller_token(token: str) -> Optional[Tuple[int, int, bool]]:
    """Decode JWT and return (seller_id, owner_id, is_primary) or None."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("role") != "seller":
            return None
        seller_id = int(payload["sub"])
        # Backwards compat: old tokens without "owner" use seller_id as owner_id
        owner_id = int(payload.get("owner", payload["sub"]))
        # Backwards compat: old tokens without "is_primary" default to True
        is_primary = payload.get("is_primary", True)
        return seller_id, owner_id, is_primary
    except (jwt.InvalidTokenError, ValueError, KeyError):
        return None


async def require_seller_token(
    x_seller_token: Optional[str] = Header(None, alias="X-Seller-Token"),
    session: AsyncSession = Depends(get_session),
) -> int:
    """Dependency: require valid seller token, return seller_id."""
    if not x_seller_token:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    decoded = decode_seller_token(x_seller_token)
    if not decoded:
        raise HTTPException(status_code=401, detail="Недействительный или истекший токен")
    seller_id, _owner_id, _is_primary = decoded
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


async def require_seller_token_with_owner(
    x_seller_token: Optional[str] = Header(None, alias="X-Seller-Token"),
    session: AsyncSession = Depends(get_session),
) -> Tuple[int, int]:
    """Dependency: require valid seller token, return (seller_id, owner_id)."""
    if not x_seller_token:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    decoded = decode_seller_token(x_seller_token)
    if not decoded:
        raise HTTPException(status_code=401, detail="Недействительный или истекший токен")
    seller_id, owner_id, _is_primary = decoded
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
    return seller_id, seller.owner_id


async def _get_owner_branches(session: AsyncSession, owner_id: int) -> list[BranchInfo]:
    """Get all branches for an owner."""
    result = await session.execute(
        select(Seller.seller_id, Seller.shop_name, Seller.address_name).where(
            Seller.owner_id == owner_id,
            Seller.deleted_at.is_(None),
        ).order_by(Seller.seller_id)
    )
    return [
        BranchInfo(seller_id=row.seller_id, shop_name=row.shop_name, address_name=row.address_name)
        for row in result.all()
    ]


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
        select(Seller, User).join(User, User.tg_id == Seller.owner_id).where(
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

    # Determine if this is an owner login (primary) or branch employee login
    is_primary = (seller.seller_id == seller.owner_id)
    token = create_seller_token(seller.seller_id, seller.owner_id, is_primary=is_primary)

    # Owner sees all branches; branch employee sees only their branch
    if is_primary:
        branches = await _get_owner_branches(session, seller.owner_id)
    else:
        branches = [BranchInfo(
            seller_id=seller.seller_id,
            shop_name=seller.shop_name,
            address_name=seller.address_name,
        )]

    return SellerLoginResponse(
        token=token,
        seller_id=seller.seller_id,
        owner_id=seller.owner_id,
        is_primary=is_primary,
        branches=branches,
    )


@router.post("/switch-branch", response_model=SwitchBranchResponse)
async def switch_branch(
    data: SwitchBranchRequest,
    auth: Tuple[int, int] = Depends(require_seller_token_with_owner),
    session: AsyncSession = Depends(get_session),
    x_seller_token: Optional[str] = Header(None, alias="X-Seller-Token"),
):
    """Switch to a different branch (same owner). Returns a new JWT.
    Only primary (owner) accounts can switch branches.
    """
    _current_seller_id, owner_id = auth

    # Only owners can switch branches
    decoded = decode_seller_token(x_seller_token) if x_seller_token else None
    if decoded and not decoded[2]:  # is_primary == False
        raise HTTPException(status_code=403, detail="Только владелец сети может переключать филиалы")

    # Verify target branch belongs to same owner
    result = await session.execute(
        select(Seller).where(
            Seller.seller_id == data.seller_id,
            Seller.owner_id == owner_id,
            Seller.deleted_at.is_(None),
        )
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Филиал не найден")
    if target.is_blocked:
        raise HTTPException(status_code=403, detail="Филиал заблокирован")
    # Owner retains is_primary=True even when switching to a branch
    token = create_seller_token(target.seller_id, owner_id, is_primary=True)
    return SwitchBranchResponse(token=token, seller_id=target.seller_id)
