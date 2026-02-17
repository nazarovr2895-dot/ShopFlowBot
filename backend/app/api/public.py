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
from backend.app.models.order import Order
from backend.app.models.cart import BuyerFavoriteSeller
from backend.app.services.cache import CacheService
from backend.app.services.sellers import _today_6am_date, _today_6am_utc
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
    city_name: Optional[str]
    district_name: Optional[str]
    metro_name: Optional[str]
    metro_walk_minutes: Optional[int] = None
    metro_line_color: Optional[str] = None
    available_slots: int  # max_orders - active_orders - pending_requests
    min_price: Optional[float]
    max_price: Optional[float]
    product_count: int
    subscriber_count: int = 0


class PublicSellerDetail(BaseModel):
    """Полная публичная информация о продавце"""
    seller_id: int
    shop_name: Optional[str]
    description: Optional[str]
    delivery_type: Optional[str]
    delivery_price: float = 0.0
    address_name: Optional[str] = None
    map_url: Optional[str]
    city_name: Optional[str]
    district_name: Optional[str]
    metro_name: Optional[str]
    metro_walk_minutes: Optional[int] = None
    metro_line_color: Optional[str] = None
    available_slots: int
    products: List[dict]
    preorder_products: List[dict] = []
    preorder_available_dates: List[str] = []
    preorder_enabled: bool = False
    preorder_discount_percent: float = 0
    preorder_discount_min_days: int = 7
    preorder_max_per_date: Optional[int] = None
    banner_url: Optional[str] = None
    subscriber_count: int = 0


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
    search: Optional[str] = Query(None, min_length=1, description="Поиск по названию магазина и хештегам"),
    city_id: Optional[int] = Query(None, description="Фильтр по городу"),
    district_id: Optional[int] = Query(None, description="Фильтр по району"),
    metro_id: Optional[int] = Query(None, description="Фильтр по станции метро"),
    delivery_type: Optional[str] = Query(None, description="Тип доставки: delivery, pickup, both"),
    free_delivery: Optional[bool] = Query(None, description="Фильтр по бесплатной доставке: true - только бесплатная, false - только платная"),
    sort_price: Optional[str] = Query(None, description="Сортировка по цене: asc, desc"),
    sort_mode: Optional[str] = Query(None, description="Режим: all_city (все магазины), nearby (по близости)"),
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
        now = datetime.utcnow()
        today = _today_6am_date()
        since_6am = _today_6am_utc()
        
        # Подзапрос: количество выполненных заказов за текущий день (с 6:00) по продавцам
        completed_today_subq = (
            select(
                Order.seller_id,
                func.count(Order.id).label("completed_today")
            )
            .where(
            Order.status.in_(("done", "completed")),
            or_(
                Order.completed_at >= since_6am,
                and_(Order.completed_at.is_(None), Order.created_at >= since_6am)
            )
        )
            .group_by(Order.seller_id)
            .subquery()
        )
        
        # Базовые условия: лимит задан на сегодня, есть свободные слоты (учитываем выполненные сегодня)
        base_conditions = [
        Seller.is_blocked == False,
        Seller.deleted_at.is_(None),
        (Seller.placement_expired_at > now) | (Seller.placement_expired_at.is_(None)),
            Seller.daily_limit_date == today,
            Seller.max_orders > 0,
        ]
        
        # Подзапрос для статистики товаров (только с количеством > 0)
        product_stats = (
        select(
            Product.seller_id,
            func.min(Product.price).label("min_price"),
            func.max(Product.price).label("max_price"),
            func.count(Product.id).label("product_count")
        )
        .where(
            Product.is_active == True,
            Product.quantity > 0  # Только товары в наличии
        )
            .group_by(Product.seller_id)
            .subquery()
        )
        
        # Условие: (выполнено сегодня + активные + ожидающие) < лимит
        completed_today_scalar = (
        select(func.count(Order.id))
        .where(
            Order.seller_id == Seller.seller_id,
            Order.status.in_(("done", "completed")),
            or_(
                Order.completed_at >= since_6am,
                and_(Order.completed_at.is_(None), Order.created_at >= since_6am)
            )
        )
            .correlate(Seller)
            .scalar_subquery()
        )
        base_conditions.append(
            (func.coalesce(completed_today_scalar, 0) + Seller.active_orders + Seller.pending_requests) < Seller.max_orders
        )
        
        # Добавляем фильтры
        if city_id:
            base_conditions.append(Seller.city_id == city_id)
        if district_id:
            base_conditions.append(Seller.district_id == district_id)
        if metro_id:
            base_conditions.append(Seller.metro_id == metro_id)
        if delivery_type:
            # delivery_type из query: "delivery", "pickup" или "both"; в БД могут быть русские значения
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
        
        # Фильтр по бесплатной/платной доставке
        if free_delivery is not None:
            if free_delivery:
                # Только бесплатная доставка (delivery_price == 0)
                base_conditions.append(Seller.delivery_price == 0.0)
            else:
                # Только платная доставка (delivery_price > 0)
                base_conditions.append(Seller.delivery_price > 0.0)
        
        # Поиск по названию магазина и хештегам (подстрока без учёта регистра)
        if search:
            q = search.strip()
            if q:
                base_conditions.append(
                    or_(
                        Seller.shop_name.ilike(f"%{q}%"),
                        func.coalesce(Seller.hashtags, "").ilike(f"%{q}%")
                    )
                )
        
        # Подзапрос для статистики товаров (только с количеством > 0)
        product_stats = (
        select(
            Product.seller_id,
            func.min(Product.price).label("min_price"),
            func.max(Product.price).label("max_price"),
            func.count(Product.id).label("product_count")
        )
        .where(
            Product.is_active == True,
            Product.quantity > 0  # Только товары в наличии
        )
            .group_by(Product.seller_id)
            .subquery()
        )
        
        # Подзапрос: количество подписчиков по продавцам
        subscriber_count_subq = (
            select(
                BuyerFavoriteSeller.seller_id,
                func.count(BuyerFavoriteSeller.id).label("subscriber_count")
            )
            .group_by(BuyerFavoriteSeller.seller_id)
            .subquery()
        )

        # Основной запрос: join с completed_today для available_slots
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
            func.coalesce(completed_today_subq.c.completed_today, 0).label("completed_today"),
            func.coalesce(subscriber_count_subq.c.subscriber_count, 0).label("subscriber_count"),
        )
        .outerjoin(User, Seller.seller_id == User.tg_id)
        .outerjoin(City, Seller.city_id == City.id)
        .outerjoin(District, Seller.district_id == District.id)
        .outerjoin(Metro, Seller.metro_id == Metro.id)
        .join(product_stats, Seller.seller_id == product_stats.c.seller_id)
            .outerjoin(completed_today_subq, Seller.seller_id == completed_today_subq.c.seller_id)
            .outerjoin(subscriber_count_subq, Seller.seller_id == subscriber_count_subq.c.seller_id)
            .where(and_(*base_conditions))
        )
        
        # Сортировка
        if sort_price == "asc":
            query = query.order_by(product_stats.c.min_price.asc().nullslast())
        elif sort_price == "desc":
            query = query.order_by(product_stats.c.max_price.desc().nullslast())
        elif sort_mode in ("all_city", "nearby"):
            query = query.order_by(sql_func.random())
        else:
            query = query.order_by(
                (Seller.max_orders - func.coalesce(completed_today_subq.c.completed_today, 0) - Seller.active_orders - Seller.pending_requests).desc()
            )
        
        # Подсчет общего количества (только продавцы с хотя бы одним товаром в наличии)
        count_query = (
        select(func.count(Seller.seller_id))
        .select_from(Seller)
            .join(product_stats, Seller.seller_id == product_stats.c.seller_id)
            .where(and_(*base_conditions))
        )
        total_result = await session.execute(count_query)
        total = total_result.scalar() or 0
        
        # Пагинация
        offset = (page - 1) * per_page
        query = query.offset(offset).limit(per_page)
        
        result = await session.execute(query)
        rows = result.all()
        
        sellers = []
        for row in rows:
            seller = row[0]
            completed_today = row.completed_today if hasattr(row, "completed_today") else 0
            available_slots = seller.max_orders - completed_today - seller.active_orders - seller.pending_requests
            
            sellers.append(PublicSellerListItem(
                seller_id=seller.seller_id,
                shop_name=seller.shop_name,
                owner_fio=row.owner_fio,
                delivery_type=_normalize_delivery_type(seller.delivery_type),
                delivery_price=float(seller.delivery_price) if seller.delivery_price else 0.0,
                city_name=row.city_name,
                district_name=row.district_name,
                metro_name=row.metro_name,
                metro_walk_minutes=seller.metro_walk_minutes,
                metro_line_color=row.metro_line_color,
                available_slots=available_slots,
                min_price=float(row.min_price) if row.min_price else None,
                max_price=float(row.max_price) if row.max_price else None,
                product_count=row.product_count or 0,
                subscriber_count=row.subscriber_count or 0,
            ))
        
        # #region agent log
        logger.info("Public sellers endpoint success", sellers_count=len(sellers), total=total, hypothesisId="B")
        # #endregion
        return PublicSellersResponse(
            sellers=sellers,
            total=total,
            page=page,
            per_page=per_page
        )
    except Exception as e:
        # #region agent log
        logger.error("Public sellers endpoint error", error_type=type(e).__name__, error_message=str(e), traceback=traceback.format_exc(), hypothesisId="C")
        # #endregion
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


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
    since_6am = _today_6am_utc()
    
    query = (
        select(
            Seller,
            City.name.label("city_name"),
            District.name.label("district_name"),
            Metro.name.label("metro_name"),
            Metro.line_color.label("metro_line_color")
        )
        .outerjoin(City, Seller.city_id == City.id)
        .outerjoin(District, Seller.district_id == District.id)
        .outerjoin(Metro, Seller.metro_id == Metro.id)
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
    
    # Свободные слоты с учётом дневного лимита и выполненных сегодня
    if seller.daily_limit_date != today or seller.max_orders <= 0:
        available_slots = 0
    else:
        completed_result = await session.execute(
            select(func.count(Order.id)).where(
                Order.seller_id == seller_id,
                Order.status.in_(("done", "completed")),
                or_(
                    Order.completed_at >= since_6am,
                    and_(Order.completed_at.is_(None), Order.created_at >= since_6am)
                )
            )
        )
        completed_today = completed_result.scalar() or 0
        available_slots = max(0, seller.max_orders - completed_today - seller.active_orders - seller.pending_requests)
    
    # Subscriber count
    sub_count_result = await session.execute(
        select(func.count()).select_from(BuyerFavoriteSeller).where(
            BuyerFavoriteSeller.seller_id == seller_id
        )
    )
    subscriber_count = sub_count_result.scalar() or 0

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
    logging.getLogger("shopflowbot.public").info(
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
            "quantity": p.quantity,
            "is_preorder": getattr(p, "is_preorder", False),
        }

    products_list = [_product_dict(p) for p in products]
    preorder_products_list = [_product_dict(p) for p in preorder_products]

    delivery_type_normalized = _normalize_delivery_type(seller.delivery_type)

    return PublicSellerDetail(
        seller_id=seller.seller_id,
        shop_name=seller.shop_name,
        description=seller.description,
        delivery_type=delivery_type_normalized,
        delivery_price=float(seller.delivery_price) if seller.delivery_price else 0.0,
        address_name=getattr(seller, "address_name", None),
        map_url=seller.map_url,
        city_name=row.city_name,
        district_name=row.district_name,
        metro_name=row.metro_name,
        metro_walk_minutes=seller.metro_walk_minutes,
        metro_line_color=row.metro_line_color,
        available_slots=available_slots,
        products=products_list,
        preorder_products=preorder_products_list,
        preorder_available_dates=preorder_available_dates,
        preorder_enabled=preorder_enabled,
        preorder_discount_percent=float(getattr(seller, "preorder_discount_percent", 0) or 0),
        preorder_discount_min_days=getattr(seller, "preorder_discount_min_days", 7) or 7,
        preorder_max_per_date=getattr(seller, "preorder_max_per_date", None),
        banner_url=getattr(seller, "banner_url", None),
        subscriber_count=subscriber_count,
    )


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