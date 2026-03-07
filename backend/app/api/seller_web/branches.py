"""Branch management and network settings."""
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.seller_web._common import (
    logger,
    get_session,
    Seller,
)
from backend.app.api.seller_auth import require_primary_seller

router = APIRouter()


# --- BRANCH MANAGEMENT ---

class CreateBranchBody(BaseModel):
    """Fields for creating a new branch."""
    shop_name: str
    city_id: Optional[int] = None
    district_id: Optional[int] = None
    metro_id: Optional[int] = None
    metro_walk_minutes: Optional[int] = None
    address_name: Optional[str] = None
    map_url: Optional[str] = None
    geo_lat: Optional[float] = None
    geo_lon: Optional[float] = None
    delivery_type: Optional[str] = None
    working_hours: Optional[dict] = None
    clone_products_from: Optional[int] = None  # seller_id to copy products from
    contact_tg_id: Optional[int] = None  # Telegram ID for order notifications


class UpdateBranchBody(BaseModel):
    shop_name: Optional[str] = None
    city_id: Optional[int] = None
    district_id: Optional[int] = None
    metro_id: Optional[int] = None
    metro_walk_minutes: Optional[int] = None
    address_name: Optional[str] = None
    map_url: Optional[str] = None
    geo_lat: Optional[float] = None
    geo_lon: Optional[float] = None
    delivery_type: Optional[str] = None
    working_hours: Optional[dict] = None
    contact_tg_id: Optional[int] = None  # Telegram ID for order notifications


@router.get("/branches")
async def list_branches(
    auth: tuple = Depends(require_primary_seller),
    session: AsyncSession = Depends(get_session),
):
    """List all branches for the current owner."""
    _seller_id, owner_id = auth
    result = await session.execute(
        select(Seller).where(
            Seller.owner_id == owner_id,
            Seller.deleted_at.is_(None),
        ).order_by(Seller.seller_id)
    )
    branches = result.scalars().all()
    return [
        {
            "seller_id": b.seller_id,
            "shop_name": b.shop_name,
            "address_name": b.address_name,
            "city_id": b.city_id,
            "district_id": b.district_id,
            "metro_id": b.metro_id,
            "metro_walk_minutes": b.metro_walk_minutes,
            "delivery_type": b.delivery_type,
            "is_blocked": b.is_blocked,
            "geo_lat": b.geo_lat,
            "geo_lon": b.geo_lon,
            "working_hours": b.working_hours,
            "web_login": b.web_login,
            "contact_tg_id": b.contact_tg_id,
        }
        for b in branches
    ]


@router.get("/branches/stats")
async def get_branches_stats(
    period: str = Query("7d", description="Period: 1d, 7d, 30d"),
    auth: tuple = Depends(require_primary_seller),
    session: AsyncSession = Depends(get_session),
):
    """Get per-branch statistics for network dashboard."""
    _seller_id, owner_id = auth
    from backend.app.models.order import Order

    # Parse period
    days = {"1d": 1, "7d": 7, "30d": 30}.get(period, 7)
    moscow_tz = ZoneInfo("Europe/Moscow")
    now_msk = datetime.now(moscow_tz)
    period_start = (now_msk - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0).replace(tzinfo=None)

    # Get all branches
    branches_result = await session.execute(
        select(Seller).where(
            Seller.owner_id == owner_id,
            Seller.deleted_at.is_(None),
        ).order_by(Seller.seller_id)
    )
    branches = branches_result.scalars().all()

    branch_stats = []
    for b in branches:
        # Revenue and order count for period
        stats_q = await session.execute(
            select(
                func.count(Order.id),
                func.coalesce(func.sum(Order.total_price), 0),
            ).where(
                Order.seller_id == b.seller_id,
                Order.status.in_(["completed", "delivered"]),
                Order.created_at >= period_start,
            )
        )
        row = stats_q.one()
        orders_count = row[0]
        revenue = float(row[1])

        branch_stats.append({
            "seller_id": b.seller_id,
            "shop_name": b.shop_name,
            "address_name": b.address_name,
            "is_primary": b.seller_id == owner_id,
            "is_blocked": b.is_blocked,
            "revenue": revenue,
            "orders": orders_count,
            "active_orders": b.active_orders or 0,
            "pending_requests": b.pending_requests or 0,
        })

    return {"branches": branch_stats, "period": period}


@router.post("/branches")
async def create_branch(
    data: CreateBranchBody,
    auth: tuple = Depends(require_primary_seller),
    session: AsyncSession = Depends(get_session),
):
    """Create a new branch for the current owner."""
    _seller_id, owner_id = auth

    # Get owner's primary seller for network-level settings
    owner_result = await session.execute(
        select(Seller).where(
            Seller.seller_id == owner_id,
            Seller.deleted_at.is_(None),
        )
    )
    owner_seller = owner_result.scalar_one_or_none()
    if not owner_seller:
        raise HTTPException(status_code=404, detail="Продавец не найден")

    # Count active branches
    count_result = await session.execute(
        select(func.count()).select_from(Seller).where(
            Seller.owner_id == owner_id,
            Seller.deleted_at.is_(None),
        )
    )
    branch_count = count_result.scalar() or 0

    # Enforce max_branches limit for network sellers
    max_br = getattr(owner_seller, 'max_branches', None)
    if max_br is not None and branch_count >= 1 + max_br:
        raise HTTPException(400, f"Достигнут лимит филиалов ({max_br})")

    # Generate unique web_login and password for the new branch
    import secrets
    from backend.app.core.password_utils import hash_password
    suffix = secrets.token_hex(3)
    web_login = f"branch_{owner_id}_{suffix}"
    raw_password = secrets.token_urlsafe(12)

    # Create new branch
    new_branch = Seller(
        owner_id=owner_id,
        shop_name=data.shop_name,
        city_id=data.city_id,
        district_id=data.district_id,
        metro_id=data.metro_id,
        metro_walk_minutes=data.metro_walk_minutes,
        address_name=data.address_name,
        map_url=data.map_url,
        geo_lat=data.geo_lat,
        geo_lon=data.geo_lon,
        delivery_type=data.delivery_type,
        working_hours=data.working_hours,
        web_login=web_login,
        web_password_hash=hash_password(raw_password),
        contact_tg_id=data.contact_tg_id,
        # Network-level fields inherited from owner
        subscription_plan=owner_seller.subscription_plan,
        yookassa_oauth_token=owner_seller.yookassa_oauth_token,
        yookassa_shop_id=owner_seller.yookassa_shop_id,
        yookassa_connected_at=owner_seller.yookassa_connected_at,
        commission_percent=owner_seller.commission_percent,
        loyalty_points_percent=owner_seller.loyalty_points_percent,
        loyalty_tiers_config=owner_seller.loyalty_tiers_config,
        max_points_discount_percent=owner_seller.max_points_discount_percent,
        points_to_ruble_rate=owner_seller.points_to_ruble_rate,
        points_expire_days=owner_seller.points_expire_days,
        inn=owner_seller.inn,
        ogrn=owner_seller.ogrn,
    )
    session.add(new_branch)
    await session.flush()

    # Clone products from another branch if requested
    if data.clone_products_from:
        source_check = await session.execute(
            select(Seller.seller_id).where(
                Seller.seller_id == data.clone_products_from,
                Seller.owner_id == owner_id,
                Seller.deleted_at.is_(None),
            )
        )
        if not source_check.scalar_one_or_none():
            raise HTTPException(400, "Источник для клонирования должен принадлежать вашей сети")

        from backend.app.models.product import Product
        source_result = await session.execute(
            select(Product).where(
                Product.seller_id == data.clone_products_from,
                Product.is_active == True,
            )
        )
        source_products = source_result.scalars().all()
        for p in source_products:
            clone = Product(
                seller_id=new_branch.seller_id,
                name=p.name,
                price=p.price,
                description=p.description,
                photo_id=p.photo_id,
                photo_ids=p.photo_ids,
                is_active=p.is_active,
                quantity=p.quantity,
                is_preorder=p.is_preorder,
                cost_price=p.cost_price,
                markup_percent=p.markup_percent,
                composition=p.composition,
            )
            session.add(clone)

    await session.commit()

    return {
        "seller_id": new_branch.seller_id,
        "shop_name": new_branch.shop_name,
        "web_login": web_login,
        "web_password": raw_password,
        "branches_count": branch_count + 1,
    }


@router.put("/branches/{branch_id}")
async def update_branch(
    branch_id: int,
    data: UpdateBranchBody,
    auth: tuple = Depends(require_primary_seller),
    session: AsyncSession = Depends(get_session),
):
    """Update a branch's settings."""
    _seller_id, owner_id = auth
    result = await session.execute(
        select(Seller).where(
            Seller.seller_id == branch_id,
            Seller.owner_id == owner_id,
            Seller.deleted_at.is_(None),
        )
    )
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Филиал не найден")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(branch, key, value)

    await session.commit()
    return {"status": "ok", "seller_id": branch.seller_id}


@router.delete("/branches/{branch_id}")
async def delete_branch(
    branch_id: int,
    auth: tuple = Depends(require_primary_seller),
    session: AsyncSession = Depends(get_session),
):
    """Soft-delete a branch."""
    _seller_id, owner_id = auth

    # Prevent deleting the last branch
    count_result = await session.execute(
        select(func.count()).select_from(Seller).where(
            Seller.owner_id == owner_id,
            Seller.deleted_at.is_(None),
        )
    )
    branch_count = count_result.scalar() or 0
    if branch_count <= 1:
        raise HTTPException(status_code=400, detail="Нельзя удалить единственный филиал")

    if branch_id == owner_id:
        raise HTTPException(status_code=400, detail="Нельзя удалить основной аккаунт сети")

    result = await session.execute(
        select(Seller).where(
            Seller.seller_id == branch_id,
            Seller.owner_id == owner_id,
            Seller.deleted_at.is_(None),
        )
    )
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Филиал не найден")

    branch.deleted_at = datetime.utcnow()
    await session.commit()
    return {"status": "deleted", "seller_id": branch_id}


@router.post("/branches/{branch_id}/reset-password")
async def reset_branch_password(
    branch_id: int,
    auth: tuple = Depends(require_primary_seller),
    session: AsyncSession = Depends(get_session),
):
    """Generate a new password for a branch. Returns plaintext once."""
    _seller_id, owner_id = auth
    result = await session.execute(
        select(Seller).where(
            Seller.seller_id == branch_id,
            Seller.owner_id == owner_id,
            Seller.deleted_at.is_(None),
        )
    )
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Филиал не найден")

    import secrets
    from backend.app.core.password_utils import hash_password
    raw_password = secrets.token_urlsafe(12)
    branch.web_password_hash = hash_password(raw_password)
    await session.commit()

    return {
        "web_login": branch.web_login,
        "web_password": raw_password,
    }


# --- NETWORK SETTINGS ---

class NetworkSettingsBody(BaseModel):
    """Network-level settings (apply to all branches)."""
    loyalty_points_percent: Optional[float] = None
    max_points_discount_percent: Optional[int] = None
    points_to_ruble_rate: Optional[float] = None
    loyalty_tiers_config: Optional[list] = None
    points_expire_days: Optional[int] = None


@router.get("/network-settings")
async def get_network_settings(
    auth: tuple = Depends(require_primary_seller),
    session: AsyncSession = Depends(get_session),
):
    """Get network-level settings from owner's primary record."""
    _seller_id, owner_id = auth
    # Find the primary seller (owner's own record)
    result = await session.execute(
        select(Seller).where(
            Seller.seller_id == owner_id,
            Seller.deleted_at.is_(None),
        )
    )
    primary = result.scalar_one_or_none()
    if not primary:
        raise HTTPException(status_code=404, detail="Продавец не найден")

    # Count branches
    count_result = await session.execute(
        select(func.count()).select_from(Seller).where(
            Seller.owner_id == owner_id,
            Seller.deleted_at.is_(None),
        )
    )
    branches_count = count_result.scalar() or 0

    return {
        "owner_id": owner_id,
        "subscription_plan": primary.subscription_plan,
        "yookassa_connected": bool(primary.yookassa_oauth_token),
        "yookassa_shop_id": primary.yookassa_shop_id,
        "yookassa_connected_at": primary.yookassa_connected_at.isoformat() if primary.yookassa_connected_at else None,
        "commission_percent": primary.commission_percent,
        "inn": primary.inn,
        "ogrn": primary.ogrn,
        "loyalty_points_percent": float(primary.loyalty_points_percent or 0),
        "max_points_discount_percent": primary.max_points_discount_percent,
        "points_to_ruble_rate": float(primary.points_to_ruble_rate or 1),
        "loyalty_tiers_config": primary.loyalty_tiers_config,
        "points_expire_days": primary.points_expire_days,
        "branches_count": branches_count,
    }


@router.put("/network-settings")
async def update_network_settings(
    data: NetworkSettingsBody,
    auth: tuple = Depends(require_primary_seller),
    session: AsyncSession = Depends(get_session),
):
    """Update network-level settings (propagates to all branches)."""
    _seller_id, owner_id = auth
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        return {"status": "ok"}

    # Update ALL branches of this owner with network-level settings
    result = await session.execute(
        select(Seller).where(
            Seller.owner_id == owner_id,
            Seller.deleted_at.is_(None),
        )
    )
    branches = result.scalars().all()
    for branch in branches:
        for key, value in update_data.items():
            setattr(branch, key, value)

    await session.commit()
    return {"status": "ok"}
