"""Seller profile: info, delivery zones, categories, security, working hours."""
import os
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.seller_web._common import (
    logger,
    get_session,
    require_seller_token,
    require_seller_token_with_owner,
    Seller,
)
from backend.app.services.sellers import SellerService, SellerServiceError
from sqlalchemy import func

router = APIRouter()


# --- SELLER INFO ---
class UpdateMeBody(BaseModel):
    """Optional profile fields for seller (e.g. preorder schedule, shop settings)."""
    preorder_enabled: Optional[bool] = None
    preorder_schedule_type: Optional[str] = None  # 'weekly' | 'interval_days' | 'custom_dates'
    preorder_weekday: Optional[int] = None  # 0=Mon, 6=Sun
    preorder_interval_days: Optional[int] = None
    preorder_base_date: Optional[str] = None  # YYYY-MM-DD
    preorder_custom_dates: Optional[List[str]] = None  # List of YYYY-MM-DD dates
    preorder_min_lead_days: Optional[int] = None  # Min days before preorder date (default 2)
    preorder_max_per_date: Optional[int] = None  # Max preorders per delivery date (null=unlimited)
    preorder_discount_percent: Optional[float] = None  # Early bird discount percent (e.g. 10.0)
    preorder_discount_min_days: Optional[int] = None  # Min days ahead for discount (default 7)
    # Shop settings
    shop_name: Optional[str] = None
    description: Optional[str] = None
    delivery_type: Optional[str] = None  # 'доставка', 'самовывоз', 'доставка и самовывоз'
    # delivery_price removed — use delivery zones only
    address_name: Optional[str] = None
    map_url: Optional[str] = None
    banner_url: Optional[str] = None  # set to empty string or null to remove banner
    logo_url: Optional[str] = None  # set to empty string or null to remove logo
    use_delivery_zones: Optional[bool] = None  # enable zone-based delivery pricing
    # Delivery slot settings
    deliveries_per_slot: Optional[int] = None  # null to disable, 1-10 deliveries per slot
    slot_days_ahead: Optional[int] = None  # days ahead to show (1-7)
    min_slot_lead_minutes: Optional[int] = None  # min advance booking time in minutes
    slot_duration_minutes: Optional[int] = None  # slot length: 60, 90, 120, 180
    # Geo coordinates (manual pin on map)
    geo_lat: Optional[float] = None
    geo_lon: Optional[float] = None
    # Metro
    metro_id: Optional[int] = None
    metro_walk_minutes: Optional[int] = None
    # Shop visibility toggle
    is_visible: Optional[bool] = None
    # Gift note toggle
    gift_note_enabled: Optional[bool] = None
    # Contact info
    contact_phone: Optional[str] = None
    contact_username: Optional[str] = None
    # Social links & About Us
    social_links_enabled: Optional[bool] = None
    social_links: Optional[dict] = None
    about_enabled: Optional[bool] = None
    about_content: Optional[list] = None
    about_background: Optional[dict] = None


@router.get("/me")
async def get_me(
    auth: tuple = Depends(require_seller_token_with_owner),
    session: AsyncSession = Depends(get_session),
):
    """Get current seller info including shop link and branch info."""
    seller_id, owner_id = auth
    try:
        service = SellerService(session)
        data = await service.get_seller(seller_id)
        if not data:
            return {}
        bot_username = os.getenv("BOT_USERNAME", "")
        mini_app_short_name = os.getenv("MINI_APP_SHORT_NAME", "")
        if bot_username:
            if mini_app_short_name:
                data["shop_link"] = f"https://t.me/{bot_username}/{mini_app_short_name}?startapp=seller_{seller_id}"
            else:
                data["shop_link"] = f"https://t.me/{bot_username}?start=seller_{seller_id}"
        else:
            data["shop_link"] = None
        mini_app_url = os.getenv("MINI_APP_URL", "")
        if mini_app_url:
            data["shop_link_web"] = f"{mini_app_url}/shop/{seller_id}"
        else:
            data["shop_link_web"] = None
        # Add branch info
        from backend.app.models.seller import Seller
        data["owner_id"] = owner_id
        count_result = await session.execute(
            select(func.count()).select_from(Seller).where(
                Seller.owner_id == owner_id,
                Seller.deleted_at.is_(None),
            )
        )
        data["branches_count"] = count_result.scalar() or 0
        # Add max_branches from primary seller record
        primary_r = await session.execute(
            select(Seller.max_branches).where(
                Seller.seller_id == owner_id,
                Seller.deleted_at.is_(None),
            )
        )
        data["max_branches"] = primary_r.scalar_one_or_none()
        return data
    except (ProgrammingError, OperationalError) as e:
        # If it's a column error (preorder_custom_dates doesn't exist), return error suggesting migration
        error_msg = str(e).lower()
        if 'column' in error_msg and ('does not exist' in error_msg or 'не существует' in error_msg or 'preorder_custom_dates' in error_msg):
            raise HTTPException(
                status_code=500,
                detail="Database schema mismatch: preorder_custom_dates column missing. Please run migration: alembic upgrade head"
            )
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        logger.exception("Error in get_me endpoint", seller_id=seller_id, error=str(e))
        raise


@router.put("/me")
async def update_me(
    body: UpdateMeBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Update current seller profile (e.g. preorder schedule, shop settings)."""
    from backend.app.models.seller import Seller
    service = SellerService(session)
    # Shop settings
    if body.shop_name is not None:
        await service.update_field(seller_id, "shop_name", body.shop_name)
    if body.description is not None:
        await service.update_field(seller_id, "description", body.description)
    if body.delivery_type is not None:
        await service.update_field(seller_id, "delivery_type", body.delivery_type)
    if body.address_name is not None:
        await service.update_field(seller_id, "address_name", body.address_name)
    if body.map_url is not None:
        await service.update_field(seller_id, "map_url", body.map_url)
    if body.banner_url is not None:
        await service.update_field(seller_id, "banner_url", body.banner_url or "")
    if body.logo_url is not None:
        await service.update_field(seller_id, "logo_url", body.logo_url or "")
    if body.use_delivery_zones is not None:
        await service.update_field(seller_id, "use_delivery_zones", body.use_delivery_zones)
    # Geo coordinates — set AFTER address_name so manual pin overrides auto-geocode
    if body.geo_lat is not None:
        await service.update_field(seller_id, "geo_lat", str(body.geo_lat))
    if body.geo_lon is not None:
        await service.update_field(seller_id, "geo_lon", str(body.geo_lon))
    # Metro
    if body.metro_id is not None:
        await service.update_field(seller_id, "metro_id", str(body.metro_id) if body.metro_id > 0 else "")
    if body.metro_walk_minutes is not None:
        await service.update_field(seller_id, "metro_walk_minutes", str(body.metro_walk_minutes) if body.metro_walk_minutes > 0 else "")
    # Shop visibility toggle
    if body.is_visible is not None:
        await service.update_field(seller_id, "is_visible", body.is_visible)
    # Gift note toggle
    if body.gift_note_enabled is not None:
        await service.update_field(seller_id, "gift_note_enabled", body.gift_note_enabled)
    # Contact info
    if body.contact_phone is not None:
        await service.update_field(seller_id, "contact_phone", body.contact_phone.strip())
    if body.contact_username is not None:
        val = body.contact_username.strip().lstrip("@")
        await service.update_field(seller_id, "contact_username", val)
    # Social links & About Us
    if body.social_links_enabled is not None:
        await service.update_field(seller_id, "social_links_enabled", body.social_links_enabled)
    if body.social_links is not None:
        await service.update_field(seller_id, "social_links", body.social_links)
    if body.about_enabled is not None:
        await service.update_field(seller_id, "about_enabled", body.about_enabled)
    if body.about_content is not None:
        await service.update_field(seller_id, "about_content", body.about_content)
    if body.about_background is not None:
        await service.update_field(seller_id, "about_background", body.about_background)
    result = await session.execute(select(Seller).where(Seller.seller_id == seller_id))
    seller = result.scalar_one_or_none()
    if seller:
        if body.preorder_enabled is not None:
            seller.preorder_enabled = body.preorder_enabled
        if body.preorder_schedule_type is not None:
            seller.preorder_schedule_type = body.preorder_schedule_type
        if body.preorder_weekday is not None:
            seller.preorder_weekday = body.preorder_weekday
        if body.preorder_interval_days is not None:
            seller.preorder_interval_days = body.preorder_interval_days
        if body.preorder_base_date is not None:
            if body.preorder_base_date and body.preorder_base_date.strip():
                try:
                    seller.preorder_base_date = datetime.strptime(body.preorder_base_date[:10], "%Y-%m-%d").date()
                except (ValueError, TypeError):
                    seller.preorder_base_date = None
            else:
                seller.preorder_base_date = None
        if body.preorder_custom_dates is not None:
            # Validate dates are YYYY-MM-DD format
            validated_dates = []
            for d_str in body.preorder_custom_dates:
                try:
                    datetime.strptime(d_str[:10], "%Y-%m-%d")
                    validated_dates.append(d_str[:10])
                except (ValueError, TypeError):
                    continue
            # Check if column exists in model (catch AttributeError if not)
            try:
                seller.preorder_custom_dates = validated_dates if validated_dates else None
            except (AttributeError, ProgrammingError, OperationalError) as e:
                logger.warning(
                    "preorder_custom_dates column not available",
                    seller_id=seller_id,
                    error=str(e)
                )
                # Ignore if column doesn't exist (migration not applied)
        if body.preorder_min_lead_days is not None:
            seller.preorder_min_lead_days = max(0, body.preorder_min_lead_days)
        if body.preorder_max_per_date is not None:
            seller.preorder_max_per_date = body.preorder_max_per_date if body.preorder_max_per_date > 0 else None
        if body.preorder_discount_percent is not None:
            seller.preorder_discount_percent = max(0, min(100, body.preorder_discount_percent))
        if body.preorder_discount_min_days is not None:
            seller.preorder_discount_min_days = max(1, body.preorder_discount_min_days)
        # Delivery slot settings
        if body.deliveries_per_slot is not None:
            seller.deliveries_per_slot = max(1, min(10, body.deliveries_per_slot)) if body.deliveries_per_slot > 0 else None
        if body.slot_days_ahead is not None:
            seller.slot_days_ahead = max(1, min(7, body.slot_days_ahead))
        if body.min_slot_lead_minutes is not None:
            seller.min_slot_lead_minutes = max(30, min(480, body.min_slot_lead_minutes))
        if body.slot_duration_minutes is not None:
            seller.slot_duration_minutes = body.slot_duration_minutes if body.slot_duration_minutes in (60, 90, 120, 180) else 120
        await session.commit()
    data = await service.get_seller(seller_id)
    if not data:
        return {}
    bot_username = os.getenv("BOT_USERNAME", "")
    mini_app_short_name = os.getenv("MINI_APP_SHORT_NAME", "")
    if bot_username:
        if mini_app_short_name:
            data["shop_link"] = f"https://t.me/{bot_username}/{mini_app_short_name}?startapp=seller_{seller_id}"
        else:
            data["shop_link"] = f"https://t.me/{bot_username}?start=seller_{seller_id}"
    else:
        data["shop_link"] = None
    mini_app_url = os.getenv("MINI_APP_URL", "")
    data["shop_link_web"] = f"{mini_app_url}/shop/{seller_id}" if mini_app_url else None
    return data


# --- DELIVERY ZONES ---

class CreateDeliveryZoneBody(BaseModel):
    name: str
    district_ids: List[int] = []
    delivery_price: float = 0.0
    min_order_amount: Optional[float] = None
    free_delivery_from: Optional[float] = None
    is_active: bool = True
    priority: int = 0


class UpdateDeliveryZoneBody(BaseModel):
    name: Optional[str] = None
    district_ids: Optional[List[int]] = None
    delivery_price: Optional[float] = None
    min_order_amount: Optional[float] = None
    free_delivery_from: Optional[float] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = None


@router.get("/delivery-zones")
async def get_delivery_zones(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """List all delivery zones for the current seller."""
    from backend.app.services.delivery_zones import DeliveryZoneService
    svc = DeliveryZoneService(session)
    return await svc.get_zones(seller_id)


@router.post("/delivery-zones")
async def create_delivery_zone(
    body: CreateDeliveryZoneBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Create a new delivery zone."""
    from backend.app.services.delivery_zones import DeliveryZoneService
    svc = DeliveryZoneService(session)
    zone = await svc.create_zone(seller_id, body.model_dump())
    await session.commit()
    return zone


@router.put("/delivery-zones/{zone_id}")
async def update_delivery_zone(
    zone_id: int,
    body: UpdateDeliveryZoneBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Update a delivery zone."""
    from backend.app.services.delivery_zones import DeliveryZoneService
    svc = DeliveryZoneService(session)
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    zone = await svc.update_zone(zone_id, seller_id, data)
    if not zone:
        raise HTTPException(status_code=404, detail="Зона доставки не найдена")
    await session.commit()
    return zone


@router.delete("/delivery-zones/{zone_id}")
async def delete_delivery_zone(
    zone_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Delete a delivery zone."""
    from backend.app.services.delivery_zones import DeliveryZoneService
    svc = DeliveryZoneService(session)
    deleted = await svc.delete_zone(zone_id, seller_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Зона доставки не найдена")
    await session.commit()
    return {"status": "ok"}


# --- CATEGORIES ---

@router.get("/categories")
async def get_categories(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """List all categories for the current seller."""
    from backend.app.models.category import Category
    result = await session.execute(
        select(Category)
        .where(Category.seller_id == seller_id)
        .order_by(Category.sort_order, Category.id)
    )
    return [
        {"id": c.id, "seller_id": c.seller_id, "name": c.name,
         "sort_order": c.sort_order, "is_active": c.is_active, "is_addon": c.is_addon}
        for c in result.scalars().all()
    ]


class CreateCategoryBody(BaseModel):
    name: str
    sort_order: int = 0
    is_addon: bool = False


class UpdateCategoryBody(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    is_addon: Optional[bool] = None


@router.post("/categories")
async def create_category(
    body: CreateCategoryBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Create a new product category."""
    from backend.app.models.category import Category
    cat = Category(seller_id=seller_id, name=body.name.strip(), sort_order=body.sort_order, is_addon=body.is_addon)
    session.add(cat)
    await session.commit()
    await session.refresh(cat)
    return {"id": cat.id, "seller_id": cat.seller_id, "name": cat.name,
            "sort_order": cat.sort_order, "is_active": cat.is_active, "is_addon": cat.is_addon}


@router.put("/categories/{category_id}")
async def update_category(
    category_id: int,
    body: UpdateCategoryBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Update a product category."""
    from backend.app.models.category import Category
    result = await session.execute(
        select(Category).where(Category.id == category_id, Category.seller_id == seller_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    if body.name is not None:
        cat.name = body.name.strip()
    if body.sort_order is not None:
        cat.sort_order = body.sort_order
    if body.is_active is not None:
        cat.is_active = body.is_active
    if body.is_addon is not None:
        cat.is_addon = body.is_addon
    await session.commit()
    await session.refresh(cat)
    return {"id": cat.id, "seller_id": cat.seller_id, "name": cat.name,
            "sort_order": cat.sort_order, "is_active": cat.is_active, "is_addon": cat.is_addon}


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Delete a product category. Unlinks all products from it."""
    from backend.app.models.category import Category
    from backend.app.models.product import Product
    result = await session.execute(
        select(Category).where(Category.id == category_id, Category.seller_id == seller_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    # Unlink products
    await session.execute(
        update(Product).where(Product.category_id == category_id).values(category_id=None)
    )
    await session.delete(cat)
    await session.commit()
    return {"status": "ok"}


# --- SECURITY ---
class ChangeCredentialsBody(BaseModel):
    old_login: str
    old_password: str
    new_login: str
    new_password: str


@router.put("/security/change-credentials")
async def change_credentials(
    body: ChangeCredentialsBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Change web login and password. Requires current credentials for verification."""
    from backend.app.core.password_validation import validate_password_strength

    # Validate new password strength
    is_valid, errors = validate_password_strength(body.new_password)
    if not is_valid:
        raise HTTPException(status_code=400, detail="; ".join(errors))

    # Validate login length
    if len(body.new_login) < 3:
        raise HTTPException(status_code=400, detail="Логин должен содержать минимум 3 символа")

    if len(body.new_login) > 64:
        raise HTTPException(status_code=400, detail="Логин слишком длинный (максимум 64 символа)")

    service = SellerService(session)
    try:
        return await service.change_web_credentials(
            seller_id,
            body.old_login,
            body.old_password,
            body.new_login,
            body.new_password,
        )
    except SellerServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


# --- WORKING HOURS ---
class WorkingHoursBody(BaseModel):
    working_hours: Optional[dict] = None  # {"0": {"open": "09:00", "close": "18:00"}, "5": null, ...}


@router.put("/working-hours")
async def update_working_hours(
    body: WorkingHoursBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Обновить время работы магазина. null = отключить (нет ограничений)."""
    from backend.app.models.seller import Seller
    import re

    result = await session.execute(select(Seller).where(Seller.seller_id == seller_id))
    seller = result.scalar_one_or_none()
    if not seller:
        raise HTTPException(status_code=404, detail="Продавец не найден")

    wh = body.working_hours
    if wh is not None:
        validated = {}
        time_pattern = re.compile(r"^\d{2}:\d{2}$")
        for key, value in wh.items():
            if key not in ("0", "1", "2", "3", "4", "5", "6"):
                raise HTTPException(status_code=400, detail=f"Некорректный день недели: {key}")
            if value is None:
                validated[key] = None  # Day off
            elif isinstance(value, dict):
                open_time = value.get("open", "")
                close_time = value.get("close", "")
                if not time_pattern.match(str(open_time)) or not time_pattern.match(str(close_time)):
                    raise HTTPException(status_code=400, detail=f"Время должно быть в формате HH:MM для дня {key}")
                if open_time >= close_time:
                    raise HTTPException(status_code=400, detail=f"Время открытия должно быть раньше закрытия для дня {key}")
                validated[key] = {"open": open_time, "close": close_time}
            else:
                raise HTTPException(status_code=400, detail=f"Некорректный формат для дня {key}")
        seller.working_hours = validated if validated else None
    else:
        seller.working_hours = None

    await session.commit()
    return {"status": "ok", "working_hours": seller.working_hours}
