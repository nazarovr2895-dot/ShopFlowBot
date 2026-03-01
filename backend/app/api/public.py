"""
Public API endpoints for Mini App
- No authentication required
- Read-only access to public seller data
- Reference data (cities, districts, metro) is cached in Redis
"""
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.sql.expression import func as sql_func
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
import json
import traceback

from backend.app.api.deps import get_session, get_cache
from backend.app.models.seller import Seller, City, District, Metro
from backend.app.models.product import Product
from backend.app.models.user import User
from backend.app.models.cart import BuyerFavoriteSeller
from backend.app.services.cache import CacheService
from backend.app.services.sellers import _today_6am_date, _is_open_now, SellerService
from backend.app.services.bouquets import get_active_bouquet_ids
from backend.app.core.logging import get_logger
from sqlalchemy import or_

logger = get_logger(__name__)


router = APIRouter()


# --- Pydantic Schemas for Public API ---

class MetroResponse(BaseModel):
    id: int
    name: str
    district_id: int
    line_color: Optional[str] = None


class DistrictResponse(BaseModel):
    id: int
    name: str
    city_id: int


class CityResponse(BaseModel):
    id: int
    name: str


class PublicSellerListItem(BaseModel):
    """Краткая информация о продавце для списка"""
    seller_id: int
    shop_name: Optional[str]
    owner_fio: Optional[str]
    delivery_type: Optional[str]
    delivery_price: float = 0.0
    min_delivery_price: Optional[float] = None
    city_name: Optional[str]
    district_name: Optional[str]
    metro_name: Optional[str]
    metro_walk_minutes: Optional[int] = None
    metro_line_color: Optional[str] = None
    available_slots: int  # effective_limit - active_orders - pending_requests
    availability: str = "available"  # "available" | "busy" | "unavailable"
    delivery_slots: Optional[int] = None
    pickup_slots: Optional[int] = None
    delivery_availability: Optional[str] = None  # "available" | "busy"
    pickup_availability: Optional[str] = None
    subscription_active: bool = True
    min_price: Optional[float]
    max_price: Optional[float]
    product_count: int
    subscriber_count: int = 0
    working_hours: Optional[dict] = None
    is_open_now: Optional[bool] = None


class PublicSellerDetail(BaseModel):
    """Полная публичная информация о продавце"""
    seller_id: int
    shop_name: Optional[str]
    description: Optional[str]
    delivery_type: Optional[str]
    delivery_price: float = 0.0
    min_delivery_price: Optional[float] = None
    address_name: Optional[str] = None
    map_url: Optional[str]
    city_id: Optional[int] = None
    city_name: Optional[str]
    district_name: Optional[str]
    metro_name: Optional[str]
    metro_walk_minutes: Optional[int] = None
    metro_line_color: Optional[str] = None
    geo_lat: Optional[float] = None
    geo_lon: Optional[float] = None
    available_slots: int
    availability: str = "available"  # "available" | "busy" | "unavailable"
    delivery_slots: Optional[int] = None
    pickup_slots: Optional[int] = None
    delivery_availability: Optional[str] = None
    pickup_availability: Optional[str] = None
    subscription_active: bool = True
    categories: List[dict] = []
    products: List[dict]
    preorder_products: List[dict] = []
    preorder_available_dates: List[str] = []
    preorder_enabled: bool = False
    preorder_discount_percent: float = 0
    preorder_discount_min_days: int = 7
    preorder_max_per_date: Optional[int] = None
    banner_url: Optional[str] = None
    subscriber_count: int = 0
    working_hours: Optional[dict] = None
    is_open_now: Optional[bool] = None
    owner_username: Optional[str] = None
    owner_tg_id: Optional[int] = None
    owner_fio: Optional[str] = None
    inn: Optional[str] = None
    ogrn: Optional[str] = None


class PublicSellersResponse(BaseModel):
    """Ответ со списком продавцов и пагинацией"""
    sellers: List[PublicSellerListItem]
    total: int
    page: int
    per_page: int


def _normalize_delivery_type(value: Optional[str]) -> Optional[str]:
    """Нормализует delivery_type из БД (русский/английский) в enum для публичного API."""
    if not value or not str(value).strip():
        return None
    v = str(value).strip().lower()
    if v in ("доставка", "delivery"):
        return "delivery"
    if v in ("самовывоз", "pickup"):
        return "pickup"
    if v in ("доставка и самовывоз", "both"):
        return "both"
    return None


# --- Endpoints ---

@router.get("/sellers", response_model=PublicSellersResponse)
async def get_public_sellers(
    request: Request,
    session: AsyncSession = Depends(get_session),
    search: Optional[str] = Query(None, min_length=1, description="Полнотекстовый поиск по товарам, категориям и магазинам"),
    city_id: Optional[int] = Query(None, description="Фильтр по городу"),
    district_id: Optional[int] = Query(None, description="Фильтр по району"),
    metro_id: Optional[int] = Query(None, description="Фильтр по станции метро"),
    delivery_type: Optional[str] = Query(None, description="Тип доставки: delivery, pickup, both"),
    free_delivery: Optional[bool] = Query(None, description="Фильтр по бесплатной доставке: true - только бесплатная, false - только платная"),
    sort_price: Optional[str] = Query(None, description="Сортировка по цене: asc, desc"),
    sort_mode: Optional[str] = Query(None, description="Режим: all_city (все магазины), nearby (по близости)"),
    price_min: Optional[int] = Query(None, ge=0, description="Мин. цена товара"),
    price_max: Optional[int] = Query(None, ge=0, description="Макс. цена товара"),
    only_available: Optional[bool] = Query(None, description="Только доступные магазины (есть слоты)"),
    has_preorder: Optional[bool] = Query(None, description="Только магазины с предзаказом"),
    show_closed: Optional[bool] = Query(None, description="Показывать закрытые магазины"),
    page: int = Query(1, ge=1, description="Номер страницы"),
    per_page: int = Query(20, ge=1, le=100, description="Количество на странице"),
):
    """
    Получить список активных продавцов с фильтрами.
    
    Условия отображения:
    - Продавец не заблокирован (is_blocked=False)
    - Размещение не истекло (placement_expired_at > now или NULL)
    - Лимит на сегодня задан и есть свободные слоты
    - Есть хотя бы один товар в наличии (is_active=True, quantity > 0)
    """
    # #region agent log
    logger.info("Public sellers endpoint called", origin=request.headers.get("origin"), page=page, per_page=per_page, hypothesisId="B")
    # #endregion
    try:
        from sqlalchemy import case, literal

        now = datetime.utcnow()
        today = _today_6am_date()

        # Эффективный лимит: ручной (если задан на сегодня) или default_daily_limit
        effective_limit_expr = case(
            (and_(Seller.daily_limit_date == today, Seller.max_orders > 0), Seller.max_orders),
            else_=func.coalesce(Seller.default_daily_limit, 30),
        )

        # Базовые условия: не заблокирован, не удалён, размещение не истекло, есть лимит, подписка активна
        base_conditions = [
            Seller.is_blocked == False,
            Seller.deleted_at.is_(None),
            (Seller.placement_expired_at > now) | (Seller.placement_expired_at.is_(None)),
            effective_limit_expr > 0,
            Seller.subscription_plan == "active",
        ]

        # Подзапрос для статистики товаров (только с количеством > 0)
        product_stats = (
            select(
                Product.seller_id,
                func.min(Product.price).label("min_price"),
                func.max(Product.price).label("max_price"),
                func.count(Product.id).label("product_count"),
            )
            .where(Product.is_active == True, Product.quantity > 0)
            .group_by(Product.seller_id)
            .subquery()
        )

        # Добавляем пользовательские фильтры
        if city_id:
            base_conditions.append(Seller.city_id == city_id)
        if district_id:
            base_conditions.append(Seller.district_id == district_id)
        if metro_id:
            base_conditions.append(Seller.metro_id == metro_id)
        if delivery_type:
            if delivery_type == "delivery":
                base_conditions.append(
                    Seller.delivery_type.in_(["delivery", "доставка", "both", "доставка и самовывоз"])
                )
            elif delivery_type == "pickup":
                base_conditions.append(
                    Seller.delivery_type.in_(["pickup", "самовывоз", "both", "доставка и самовывоз"])
                )
            elif delivery_type == "both":
                base_conditions.append(
                    Seller.delivery_type.in_(["both", "доставка и самовывоз"])
                )

        if free_delivery is not None:
            from backend.app.models.delivery_zone import DeliveryZone
            has_free_zone = (
                select(DeliveryZone.seller_id)
                .where(
                    DeliveryZone.seller_id == Seller.seller_id,
                    DeliveryZone.is_active == True,
                    DeliveryZone.delivery_price == 0,
                )
                .correlate(Seller)
                .exists()
            )
            if free_delivery:
                base_conditions.append(has_free_zone)
            else:
                base_conditions.append(~has_free_zone)

        if search:
            q = search.strip()
            if q:
                from backend.app.models.category import Category
                tsquery = func.plainto_tsquery('russian', q)

                # Products matching by FTS or trigram similarity
                product_match_subq = (
                    select(Product.seller_id)
                    .where(
                        Product.is_active == True,
                        Product.quantity > 0,
                        or_(
                            Product.search_vector.op('@@')(tsquery),
                            func.similarity(Product.name, q) > 0.3,
                        ),
                    )
                    .distinct()
                    .subquery()
                )

                # Categories matching by trigram similarity
                category_match_subq = (
                    select(Category.seller_id)
                    .where(
                        Category.is_active == True,
                        func.similarity(Category.name, q) > 0.3,
                    )
                    .distinct()
                    .subquery()
                )

                # Seller matches if: name/description FTS match OR product match OR category match
                base_conditions.append(
                    or_(
                        Seller.search_vector.op('@@')(tsquery),
                        func.similarity(func.coalesce(Seller.shop_name, ''), q) > 0.3,
                        Seller.seller_id.in_(select(product_match_subq.c.seller_id)),
                        Seller.seller_id.in_(select(category_match_subq.c.seller_id)),
                    )
                )

        if has_preorder:
            base_conditions.append(Seller.preorder_enabled == True)

        # Подзапрос: количество подписчиков по продавцам
        subscriber_count_subq = (
            select(
                BuyerFavoriteSeller.seller_id,
                func.count(BuyerFavoriteSeller.id).label("subscriber_count"),
            )
            .group_by(BuyerFavoriteSeller.seller_id)
            .subquery()
        )

        # available_slots: effective_limit - active - pending (без completed_today)
        available_slots_expr = effective_limit_expr - Seller.active_orders - Seller.pending_requests

        if only_available:
            base_conditions.append(available_slots_expr > 0)

        # Per-type slot expressions
        delivery_slots_expr = func.coalesce(Seller.max_delivery_orders, 10) - func.coalesce(Seller.active_delivery_orders, 0) - func.coalesce(Seller.pending_delivery_requests, 0)
        pickup_slots_expr = func.coalesce(Seller.max_pickup_orders, 20) - func.coalesce(Seller.active_pickup_orders, 0) - func.coalesce(Seller.pending_pickup_requests, 0)

        # Min delivery price from active zones (per seller)
        from backend.app.models.delivery_zone import DeliveryZone as DZ
        min_dp_subq = (
            select(
                DZ.seller_id,
                func.min(DZ.delivery_price).label("min_delivery_price"),
            )
            .where(DZ.is_active == True)
            .group_by(DZ.seller_id)
            .subquery()
        )

        # Основной запрос
        query = (
            select(
                Seller,
                User.fio.label("owner_fio"),
                City.name.label("city_name"),
                District.name.label("district_name"),
                Metro.name.label("metro_name"),
                Metro.line_color.label("metro_line_color"),
                product_stats.c.min_price,
                product_stats.c.max_price,
                func.coalesce(product_stats.c.product_count, 0).label("product_count"),
                func.coalesce(subscriber_count_subq.c.subscriber_count, 0).label("subscriber_count"),
                available_slots_expr.label("available_slots"),
                delivery_slots_expr.label("delivery_slots"),
                pickup_slots_expr.label("pickup_slots"),
                min_dp_subq.c.min_delivery_price,
            )
            .outerjoin(User, Seller.owner_id == User.tg_id)
            .outerjoin(City, Seller.city_id == City.id)
            .outerjoin(District, Seller.district_id == District.id)
            .outerjoin(Metro, Seller.metro_id == Metro.id)
            .join(product_stats, Seller.seller_id == product_stats.c.seller_id)
            .outerjoin(subscriber_count_subq, Seller.seller_id == subscriber_count_subq.c.seller_id)
            .outerjoin(min_dp_subq, Seller.seller_id == min_dp_subq.c.seller_id)
            .where(and_(*base_conditions))
        )

        # Фильтр по диапазону цен (на уровне продуктов продавца)
        if price_min is not None:
            query = query.where(product_stats.c.min_price >= price_min)
        if price_max is not None:
            query = query.where(product_stats.c.max_price <= price_max)

        # Сортировка: доступные первыми, затем занятые
        if sort_price == "asc":
            query = query.order_by(product_stats.c.min_price.asc().nullslast())
        elif sort_price == "desc":
            query = query.order_by(product_stats.c.max_price.desc().nullslast())
        elif sort_mode in ("all_city", "nearby"):
            query = query.order_by(sql_func.random())
        else:
            # Сначала доступные (slots > 0), потом занятые (slots <= 0)
            query = query.order_by(
                case((available_slots_expr > 0, 0), else_=1).asc(),
                available_slots_expr.desc(),
            )

        # Подсчет общего количества
        count_query = (
            select(func.count(Seller.seller_id))
            .select_from(Seller)
            .join(product_stats, Seller.seller_id == product_stats.c.seller_id)
            .where(and_(*base_conditions))
        )
        if price_min is not None:
            count_query = count_query.where(product_stats.c.min_price >= price_min)
        if price_max is not None:
            count_query = count_query.where(product_stats.c.max_price <= price_max)
        total_result = await session.execute(count_query)
        total = total_result.scalar() or 0

        # Пагинация
        offset = (page - 1) * per_page
        query = query.offset(offset).limit(per_page)

        result = await session.execute(query)
        rows = result.all()

        sellers = []
        filtered_out = 0
        for row in rows:
            seller = row[0]

            # Filter by working hours: hide shops that are closed or on day off
            wh = getattr(seller, "working_hours", None)
            is_open = _is_open_now(wh)
            if is_open is False and not show_closed:
                filtered_out += 1
                continue

            slots = row.available_slots if hasattr(row, "available_slots") else 0
            if slots > 0:
                availability = "available"
            else:
                availability = "busy"

            d_slots = max(0, row.delivery_slots) if hasattr(row, "delivery_slots") else 0
            p_slots = max(0, row.pickup_slots) if hasattr(row, "pickup_slots") else 0

            sellers.append(PublicSellerListItem(
                seller_id=seller.seller_id,
                shop_name=seller.shop_name,
                owner_fio=row.owner_fio,
                delivery_type=_normalize_delivery_type(seller.delivery_type),
                delivery_price=0.0,  # deprecated: use delivery zones
                min_delivery_price=float(row.min_delivery_price) if row.min_delivery_price is not None else None,
                city_name=row.city_name,
                district_name=row.district_name,
                metro_name=row.metro_name,
                metro_walk_minutes=seller.metro_walk_minutes,
                metro_line_color=row.metro_line_color,
                available_slots=max(slots, 0),
                availability=availability,
                delivery_slots=d_slots,
                pickup_slots=p_slots,
                delivery_availability="available" if d_slots > 0 else "busy",
                pickup_availability="available" if p_slots > 0 else "busy",
                min_price=float(row.min_price) if row.min_price else None,
                max_price=float(row.max_price) if row.max_price else None,
                product_count=row.product_count or 0,
                subscriber_count=row.subscriber_count or 0,
                working_hours=wh,
                is_open_now=is_open,
            ))
        total = max(0, total - filtered_out)

        logger.info("Public sellers endpoint success", sellers_count=len(sellers), total=total)
        return PublicSellersResponse(
            sellers=sellers,
            total=total,
            page=page,
            per_page=per_page,
        )
    except Exception as e:
        logger.error("Public sellers endpoint error", error_type=type(e).__name__, error_message=str(e), traceback=traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


class SellerGeoItem(BaseModel):
    """Seller coordinates for map display."""
    seller_id: int
    shop_name: Optional[str] = None
    geo_lat: Optional[float] = None
    geo_lon: Optional[float] = None
    metro_name: Optional[str] = None
    metro_line_color: Optional[str] = None
    availability: str = "available"
    product_count: int = 0
    min_price: Optional[float] = None
    delivery_type: Optional[str] = None


class MetroGeoItem(BaseModel):
    """Metro station with coordinates for map display."""
    id: int
    name: str
    geo_lat: Optional[float] = None
    geo_lon: Optional[float] = None
    line_color: Optional[str] = None
    line_name: Optional[str] = None


@router.get("/sellers/geo", response_model=List[SellerGeoItem])
async def get_sellers_geo(
    city_id: Optional[int] = Query(None, description="Filter by city"),
    sw_lat: Optional[float] = Query(None, description="Bounding box south-west latitude"),
    sw_lon: Optional[float] = Query(None, description="Bounding box south-west longitude"),
    ne_lat: Optional[float] = Query(None, description="Bounding box north-east latitude"),
    ne_lon: Optional[float] = Query(None, description="Bounding box north-east longitude"),
    session: AsyncSession = Depends(get_session),
):
    """
    Lightweight seller coordinates for map display.
    Returns sellers with geo coordinates (own or metro fallback).
    """
    from sqlalchemy import case, literal
    now = datetime.utcnow()
    today = _today_6am_date()

    effective_limit_expr = case(
        (and_(Seller.daily_limit_date == today, Seller.max_orders > 0), Seller.max_orders),
        else_=func.coalesce(Seller.default_daily_limit, 30),
    )

    base_conditions = [
        Seller.is_blocked == False,
        Seller.deleted_at.is_(None),
        (Seller.placement_expired_at > now) | (Seller.placement_expired_at.is_(None)),
        effective_limit_expr > 0,
        Seller.subscription_plan == "active",
    ]

    if city_id:
        base_conditions.append(Seller.city_id == city_id)

    product_stats = (
        select(
            Product.seller_id,
            func.min(Product.price).label("min_price"),
            func.count(Product.id).label("product_count"),
        )
        .where(Product.is_active == True, Product.quantity > 0)
        .group_by(Product.seller_id)
        .subquery()
    )

    available_slots_expr = effective_limit_expr - Seller.active_orders - Seller.pending_requests

    # Effective geo: seller's own coords or metro fallback
    eff_lat = func.coalesce(Seller.geo_lat, Metro.geo_lat)
    eff_lon = func.coalesce(Seller.geo_lon, Metro.geo_lon)

    query = (
        select(
            Seller.seller_id,
            Seller.shop_name,
            eff_lat.label("geo_lat"),
            eff_lon.label("geo_lon"),
            Metro.name.label("metro_name"),
            Metro.line_color.label("metro_line_color"),
            available_slots_expr.label("available_slots"),
            func.coalesce(product_stats.c.product_count, 0).label("product_count"),
            product_stats.c.min_price,
            Seller.delivery_type,
        )
        .outerjoin(Metro, Seller.metro_id == Metro.id)
        .join(product_stats, Seller.seller_id == product_stats.c.seller_id)
        .where(and_(*base_conditions))
        # Only sellers with some coordinates
        .where(or_(Seller.geo_lat.isnot(None), Metro.geo_lat.isnot(None)))
    )

    # Viewport bounding box filter
    if all(v is not None for v in (sw_lat, sw_lon, ne_lat, ne_lon)):
        query = query.where(
            eff_lat.between(sw_lat, ne_lat),
            eff_lon.between(sw_lon, ne_lon),
        )

    result = await session.execute(query)
    rows = result.all()

    items = []
    for row in rows:
        slots = row.available_slots if row.available_slots else 0
        items.append(SellerGeoItem(
            seller_id=row.seller_id,
            shop_name=row.shop_name,
            geo_lat=row.geo_lat,
            geo_lon=row.geo_lon,
            metro_name=row.metro_name,
            metro_line_color=row.metro_line_color,
            availability="available" if slots > 0 else "busy",
            product_count=row.product_count or 0,
            min_price=float(row.min_price) if row.min_price else None,
            delivery_type=_normalize_delivery_type(row.delivery_type),
        ))
    return items


@router.get("/sellers/{seller_id}", response_model=PublicSellerDetail)
async def get_public_seller_detail(
    seller_id: int,
    session: AsyncSession = Depends(get_session)
):
    """
    Получить публичный профиль продавца с товарами.
    """
    now = datetime.utcnow()
    today = _today_6am_date()

    query = (
        select(
            Seller,
            City.name.label("city_name"),
            District.name.label("district_name"),
            Metro.name.label("metro_name"),
            Metro.line_color.label("metro_line_color"),
            Metro.geo_lat.label("metro_geo_lat"),
            Metro.geo_lon.label("metro_geo_lon"),
            User.username.label("owner_username"),
            User.fio.label("owner_fio"),
        )
        .outerjoin(City, Seller.city_id == City.id)
        .outerjoin(District, Seller.district_id == District.id)
        .outerjoin(Metro, Seller.metro_id == Metro.id)
        .outerjoin(User, Seller.owner_id == User.tg_id)
        .where(Seller.seller_id == seller_id)
    )

    result = await session.execute(query)
    row = result.first()

    if not row:
        raise HTTPException(status_code=404, detail="Продавец не найден")

    seller = row[0]

    if seller.deleted_at:
        raise HTTPException(status_code=404, detail="Продавец не найден")

    if seller.is_blocked:
        raise HTTPException(status_code=403, detail="Продавец заблокирован")

    if seller.placement_expired_at and seller.placement_expired_at < now:
        raise HTTPException(status_code=403, detail="Размещение продавца истекло")

    # Subscription check
    seller_plan = getattr(seller, "subscription_plan", "none") or "none"
    subscription_active = seller_plan == "active"

    # Эффективный лимит через SellerService
    seller_service = SellerService(session)
    limits = seller_service._effective_limits(seller)
    effective_limit = limits["delivery"] + limits["pickup"]
    available_slots = max(0, effective_limit - seller.active_orders - seller.pending_requests)

    d_used = (getattr(seller, "active_delivery_orders", 0) or 0) + (getattr(seller, "pending_delivery_requests", 0) or 0)
    p_used = (getattr(seller, "active_pickup_orders", 0) or 0) + (getattr(seller, "pending_pickup_requests", 0) or 0)
    d_slots = max(0, limits["delivery"] - d_used)
    p_slots = max(0, limits["pickup"] - p_used)

    if not subscription_active:
        availability = "unavailable"
    elif available_slots > 0:
        availability = "available"
    elif effective_limit > 0:
        availability = "busy"
    else:
        availability = "unavailable"
    
    # Subscriber count
    sub_count_result = await session.execute(
        select(func.count()).select_from(BuyerFavoriteSeller).where(
            BuyerFavoriteSeller.seller_id == seller_id
        )
    )
    subscriber_count = sub_count_result.scalar() or 0

    # Min delivery price from active zones
    from backend.app.models.delivery_zone import DeliveryZone
    min_dp_result = await session.execute(
        select(func.min(DeliveryZone.delivery_price)).where(
            DeliveryZone.seller_id == seller_id,
            DeliveryZone.is_active == True,
        )
    )
    min_delivery_price_raw = min_dp_result.scalar()
    min_delivery_price = float(min_delivery_price_raw) if min_delivery_price_raw is not None else None

    # Regular products (in stock, is_preorder=False)
    products_query = (
        select(Product)
        .where(
            Product.seller_id == seller_id,
            Product.is_active == True,
            Product.quantity > 0,
            Product.is_preorder == False,
        )
        .order_by(Product.price.asc())
    )
    products_result = await session.execute(products_query)
    products = list(products_result.scalars().all())
    active_bouquet_ids = await get_active_bouquet_ids(session, seller_id)
    products = [
        p for p in products
        if getattr(p, "bouquet_id", None) is None or p.bouquet_id in active_bouquet_ids
    ]
    # Preorder products (is_preorder=True, active)
    preorder_query = (
        select(Product)
        .where(
            Product.seller_id == seller_id,
            Product.is_active == True,
            Product.is_preorder == True,
        )
        .order_by(Product.price.asc())
    )
    preorder_result = await session.execute(preorder_query)
    preorder_products = list(preorder_result.scalars().all())
    preorder_products = [
        p for p in preorder_products
        if getattr(p, "bouquet_id", None) is None or p.bouquet_id in active_bouquet_ids
    ]
    if not products and not preorder_products:
        raise HTTPException(status_code=404, detail="Продавец не найден")
    from backend.app.services.sellers import get_preorder_available_dates
    # Column temporarily commented out in model until migration is applied
    preorder_custom_dates = getattr(seller, "preorder_custom_dates", None)
    preorder_available_dates = get_preorder_available_dates(
        getattr(seller, "preorder_enabled", False),
        getattr(seller, "preorder_schedule_type", None),
        getattr(seller, "preorder_weekday", None),
        getattr(seller, "preorder_interval_days", None),
        getattr(seller, "preorder_base_date", None),
        preorder_custom_dates,
        min_lead_days=getattr(seller, "preorder_min_lead_days", 2) or 0,
    )
    preorder_enabled = bool(getattr(seller, "preorder_enabled", False) and preorder_available_dates and preorder_products)
    # Debug: log preorder condition for diagnostics
    import logging
    logging.getLogger("flurai.public").info(
        "Seller %s preorder check: db_flag=%s, schedule_type=%s, weekday=%s, "
        "interval=%s, base_date=%s, custom_dates=%s, available_dates=%s, "
        "preorder_products=%d, regular_products=%d, => enabled=%s",
        seller_id,
        getattr(seller, "preorder_enabled", False),
        getattr(seller, "preorder_schedule_type", None),
        getattr(seller, "preorder_weekday", None),
        getattr(seller, "preorder_interval_days", None),
        getattr(seller, "preorder_base_date", None),
        preorder_custom_dates,
        preorder_available_dates,
        len(preorder_products),
        len(products),
        preorder_enabled,
    )

    def _photo_ids(p):
        if p.photo_ids:
            return p.photo_ids
        return [p.photo_id] if p.photo_id else []

    def _product_dict(p):
        return {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "price": float(p.price),
            "photo_id": (p.photo_ids or [p.photo_id] if p.photo_id else [None])[0] if (p.photo_ids or p.photo_id) else None,
            "photo_ids": _photo_ids(p),
            "quantity": max(0, p.quantity - (getattr(p, "reserved_quantity", 0) or 0)),
            "is_preorder": getattr(p, "is_preorder", False),
            "composition": getattr(p, "composition", None),
            "category_id": getattr(p, "category_id", None),
        }

    products_list = [_product_dict(p) for p in products]
    preorder_products_list = [_product_dict(p) for p in preorder_products]

    # Seller categories
    from backend.app.models.category import Category
    cat_result = await session.execute(
        select(Category)
        .where(Category.seller_id == seller_id, Category.is_active == True)
        .order_by(Category.sort_order, Category.id)
    )
    categories_list = [
        {"id": c.id, "name": c.name, "sort_order": c.sort_order}
        for c in cat_result.scalars().all()
    ]

    delivery_type_normalized = _normalize_delivery_type(seller.delivery_type)

    # Geo: prefer seller's own coords, fallback to metro station coords
    seller_geo_lat = getattr(seller, "geo_lat", None)
    seller_geo_lon = getattr(seller, "geo_lon", None)
    effective_lat = seller_geo_lat if seller_geo_lat is not None else row.metro_geo_lat
    effective_lon = seller_geo_lon if seller_geo_lon is not None else row.metro_geo_lon

    return PublicSellerDetail(
        seller_id=seller.seller_id,
        shop_name=seller.shop_name,
        description=seller.description,
        delivery_type=delivery_type_normalized,
        delivery_price=0.0,  # deprecated: use delivery zones
        min_delivery_price=min_delivery_price,
        categories=categories_list,
        address_name=getattr(seller, "address_name", None),
        map_url=seller.map_url,
        city_id=seller.city_id,
        city_name=row.city_name,
        district_name=row.district_name,
        metro_name=row.metro_name,
        metro_walk_minutes=seller.metro_walk_minutes,
        metro_line_color=row.metro_line_color,
        geo_lat=effective_lat,
        geo_lon=effective_lon,
        available_slots=available_slots,
        availability=availability,
        delivery_slots=d_slots,
        pickup_slots=p_slots,
        delivery_availability="available" if d_slots > 0 else "busy",
        pickup_availability="available" if p_slots > 0 else "busy",
        subscription_active=subscription_active,
        products=products_list,
        preorder_products=preorder_products_list,
        preorder_available_dates=preorder_available_dates,
        preorder_enabled=preorder_enabled,
        preorder_discount_percent=float(getattr(seller, "preorder_discount_percent", 0) or 0),
        preorder_discount_min_days=getattr(seller, "preorder_discount_min_days", 7) or 7,
        preorder_max_per_date=getattr(seller, "preorder_max_per_date", None),
        banner_url=getattr(seller, "banner_url", None),
        subscriber_count=subscriber_count,
        working_hours=getattr(seller, "working_hours", None),
        is_open_now=_is_open_now(getattr(seller, "working_hours", None)),
        owner_username=row.owner_username,
        owner_tg_id=seller.seller_id,
        owner_fio=row.owner_fio,
        inn=seller.inn,
        ogrn=seller.ogrn,
    )


@router.get("/sellers/{seller_id}/availability")
async def get_seller_availability(
    seller_id: int,
    session: AsyncSession = Depends(get_session),
):
    """Доступные слоты по типу доставки для продавца."""
    service = SellerService(session)
    return await service.get_available_slots(seller_id)


@router.get("/metro/search", response_model=List[MetroResponse])
async def search_metro_stations(
    q: str = Query(..., min_length=1, description="Поиск по названию станции"),
    session: AsyncSession = Depends(get_session),
):
    """
    Поиск станций метро по названию по всем районам.
    Возвращает список станций с id, name, district_id, line_color.
    """
    query = (
        select(Metro)
        .where(Metro.name.ilike(f"%{q}%"))
        .order_by(Metro.name)
        .limit(50)
    )
    result = await session.execute(query)
    stations = result.scalars().all()
    return [
        MetroResponse(id=s.id, name=s.name, district_id=s.district_id, line_color=s.line_color)
        for s in stations
    ]


@router.get("/metro/{district_id}", response_model=List[MetroResponse])
async def get_metro_stations(
    district_id: int,
    session: AsyncSession = Depends(get_session),
    cache: CacheService = Depends(get_cache)
):
    """
    Получить список станций метро в районе.
    Кэшируется на 1 час (TTL: 3600 секунд).
    """
    # Сначала проверяем кэш
    cached = await cache.get_metro(district_id)
    if cached:
        return [MetroResponse(**s) for s in cached]
    
    # Запрос к БД
    query = (
        select(Metro)
        .where(Metro.district_id == district_id)
        .order_by(Metro.name)
    )
    
    result = await session.execute(query)
    stations = result.scalars().all()
    
    stations_data = [
        {"id": s.id, "name": s.name, "district_id": s.district_id, "line_color": s.line_color}
        for s in stations
    ]
    
    # Сохраняем в кэш
    await cache.set_metro(district_id, stations_data)
    
    return [MetroResponse(**s) for s in stations_data]




@router.get("/metro/city/{city_id}", response_model=List[MetroGeoItem])
async def get_metro_by_city(
    city_id: int,
    session: AsyncSession = Depends(get_session),
):
    """All metro stations in a city with coordinates (for map display)."""
    query = (
        select(Metro)
        .where(Metro.city_id == city_id, Metro.geo_lat.isnot(None))
        .order_by(Metro.name)
    )
    result = await session.execute(query)
    stations = result.scalars().all()
    return [
        MetroGeoItem(
            id=s.id,
            name=s.name,
            geo_lat=s.geo_lat,
            geo_lon=s.geo_lon,
            line_color=s.line_color,
            line_name=s.line_name,
        )
        for s in stations
    ]


@router.get("/cities", response_model=List[CityResponse])
async def get_cities(
    session: AsyncSession = Depends(get_session),
    cache: CacheService = Depends(get_cache)
):
    """
    Получить список всех городов.
    Кэшируется на 1 час (TTL: 3600 секунд).
    """
    # Сначала проверяем кэш
    cached = await cache.get_cities()
    if cached:
        return [CityResponse(**c) for c in cached]
    
    # Запрос к БД
    query = select(City).order_by(City.name)
    result = await session.execute(query)
    cities = result.scalars().all()
    
    cities_data = [{"id": c.id, "name": c.name} for c in cities]
    
    # Сохраняем в кэш
    await cache.set_cities(cities_data)
    
    return [CityResponse(**c) for c in cities_data]


@router.get("/districts/{city_id}", response_model=List[DistrictResponse])
async def get_districts(
    city_id: int,
    session: AsyncSession = Depends(get_session),
    cache: CacheService = Depends(get_cache)
):
    """
    Получить список районов города.
    Кэшируется на 1 час (TTL: 3600 секунд).
    """
    # Сначала проверяем кэш
    cached = await cache.get_districts(city_id)
    if cached:
        return [DistrictResponse(**d) for d in cached]
    
    # Запрос к БД
    query = (
        select(District)
        .where(District.city_id == city_id)
        .order_by(District.name)
    )
    
    result = await session.execute(query)
    districts = result.scalars().all()
    
    districts_data = [
        {"id": d.id, "name": d.name, "city_id": d.city_id}
        for d in districts
    ]
    
    # Сохраняем в кэш
    await cache.set_districts(city_id, districts_data)
    
    return [DistrictResponse(**d) for d in districts_data]


# --- ADDRESS AUTOCOMPLETE & DELIVERY ZONE CHECK ---

class CheckDeliveryBody(BaseModel):
    district_id: Optional[int] = None
    district_name: Optional[str] = None  # e.g. "Арбат"
    address: Optional[str] = None  # full address string for DaData district resolution


@router.get("/address/suggest")
async def suggest_address_endpoint(
    query: str = Query(..., min_length=2, description="Строка для поиска адреса"),
    city: Optional[str] = Query(None, description="KLADR ID города для фильтрации"),
    count: int = Query(5, ge=1, le=10),
):
    """DaData address autocomplete for buyer checkout."""
    from backend.app.services.dadata_address import suggest_address
    suggestions = await suggest_address(query, count=count, city_kladr_id=city)
    # Enrich suggestions with district_id from DB by matching city_district name
    return suggestions


@router.get("/address/reverse-geocode")
async def reverse_geocode_endpoint(
    lat: float = Query(..., description="Широта"),
    lon: float = Query(..., description="Долгота"),
):
    """Reverse geocode coordinates → address via DaData geolocate."""
    from backend.app.services.dadata_address import reverse_geocode_address
    return await reverse_geocode_address(lat, lon)


@router.post("/sellers/{seller_id}/check-delivery")
async def check_delivery_endpoint(
    seller_id: int,
    body: CheckDeliveryBody,
    session: AsyncSession = Depends(get_session),
):
    """Check if seller delivers to the given district. Returns zone + price."""
    from backend.app.services.delivery_zones import DeliveryZoneService
    svc = DeliveryZoneService(session)
    return await svc.check_delivery(
        seller_id,
        district_id=body.district_id,
        district_name=body.district_name,
        address=body.address,
    )


@router.get("/sellers/{seller_id}/delivery-zones")
async def get_seller_delivery_zones(
    seller_id: int,
    session: AsyncSession = Depends(get_session),
):
    """Get active delivery zones for a seller (public, for checkout UI)."""
    from backend.app.services.delivery_zones import DeliveryZoneService
    svc = DeliveryZoneService(session)
    return await svc.get_active_zones(seller_id)


@router.get("/sellers/{seller_id}/delivery-slots")
async def get_seller_delivery_slots(
    seller_id: int,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    """Get available delivery time slots for a seller (public, for checkout UI)."""
    from datetime import date as _date, timedelta
    from backend.app.services.delivery_slots import DeliverySlotService
    svc = DeliverySlotService(session)
    today = _date.today()
    try:
        d_from = _date.fromisoformat(date_from) if date_from else today
    except ValueError:
        d_from = today
    try:
        d_to = _date.fromisoformat(date_to) if date_to else today + timedelta(days=7)
    except ValueError:
        d_to = today + timedelta(days=7)
    return await svc.get_available_slots(seller_id, d_from, d_to)