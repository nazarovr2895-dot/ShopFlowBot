"""
Public API endpoints for Mini App
- No authentication required
- Read-only access to public seller data
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.sql.expression import func as sql_func
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

from backend.app.api.deps import get_session
from backend.app.models.seller import Seller, City, District, Metro
from backend.app.models.product import Product
from backend.app.models.user import User


router = APIRouter()


# --- Pydantic Schemas for Public API ---

class MetroResponse(BaseModel):
    id: int
    name: str
    district_id: int


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
    city_name: Optional[str]
    district_name: Optional[str]
    metro_name: Optional[str]
    available_slots: int  # max_orders - active_orders - pending_requests
    min_price: Optional[float]
    max_price: Optional[float]
    product_count: int


class PublicSellerDetail(BaseModel):
    """Полная публичная информация о продавце"""
    seller_id: int
    shop_name: Optional[str]
    description: Optional[str]
    delivery_type: Optional[str]
    map_url: Optional[str]
    city_name: Optional[str]
    district_name: Optional[str]
    metro_name: Optional[str]
    available_slots: int
    products: List[dict]


class PublicSellersResponse(BaseModel):
    """Ответ со списком продавцов и пагинацией"""
    sellers: List[PublicSellerListItem]
    total: int
    page: int
    per_page: int


# --- Endpoints ---

@router.get("/sellers", response_model=PublicSellersResponse)
async def get_public_sellers(
    session: AsyncSession = Depends(get_session),
    city_id: Optional[int] = Query(None, description="Фильтр по городу"),
    district_id: Optional[int] = Query(None, description="Фильтр по району"),
    metro_id: Optional[int] = Query(None, description="Фильтр по станции метро"),
    delivery_type: Optional[str] = Query(None, description="Тип доставки: delivery, pickup, both"),
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
    - Есть свободные слоты (active_orders + pending_requests < max_orders)
    """
    now = datetime.utcnow()
    
    # Базовые условия для активных продавцов
    base_conditions = [
        Seller.is_blocked == False,
        # Не soft-deleted
        Seller.deleted_at.is_(None),
        # Размещение активно или не установлено
        (Seller.placement_expired_at > now) | (Seller.placement_expired_at.is_(None)),
        # Есть свободные слоты
        (Seller.active_orders + Seller.pending_requests) < Seller.max_orders
    ]
    
    # Добавляем фильтры
    if city_id:
        base_conditions.append(Seller.city_id == city_id)
    if district_id:
        base_conditions.append(Seller.district_id == district_id)
    if metro_id:
        base_conditions.append(Seller.metro_id == metro_id)
    if delivery_type:
        # delivery_type может быть "delivery", "pickup" или "both"
        if delivery_type in ("delivery", "pickup"):
            base_conditions.append(
                (Seller.delivery_type == delivery_type) | (Seller.delivery_type == "both")
            )
        elif delivery_type == "both":
            base_conditions.append(Seller.delivery_type == "both")
    
    # Подзапрос для статистики товаров
    product_stats = (
        select(
            Product.seller_id,
            func.min(Product.price).label("min_price"),
            func.max(Product.price).label("max_price"),
            func.count(Product.id).label("product_count")
        )
        .where(Product.is_active == True)
        .group_by(Product.seller_id)
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
            product_stats.c.min_price,
            product_stats.c.max_price,
            func.coalesce(product_stats.c.product_count, 0).label("product_count")
        )
        .outerjoin(User, Seller.seller_id == User.tg_id)
        .outerjoin(City, Seller.city_id == City.id)
        .outerjoin(District, Seller.district_id == District.id)
        .outerjoin(Metro, Seller.metro_id == Metro.id)
        .outerjoin(product_stats, Seller.seller_id == product_stats.c.seller_id)
        .where(and_(*base_conditions))
    )
    
    # Сортировка
    if sort_price == "asc":
        query = query.order_by(product_stats.c.min_price.asc().nullslast())
    elif sort_price == "desc":
        query = query.order_by(product_stats.c.max_price.desc().nullslast())
    elif sort_mode in ("all_city", "nearby"):
        # Случайная сортировка для режимов "Все магазины" и "По близости"
        query = query.order_by(sql_func.random())
    else:
        # По умолчанию сортируем по количеству свободных слотов (больше слотов = выше)
        query = query.order_by(
            (Seller.max_orders - Seller.active_orders - Seller.pending_requests).desc()
        )
    
    # Подсчет общего количества
    count_query = (
        select(func.count(Seller.seller_id))
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
        seller = row[0]  # Seller object
        available_slots = seller.max_orders - seller.active_orders - seller.pending_requests
        
        sellers.append(PublicSellerListItem(
            seller_id=seller.seller_id,
            shop_name=seller.shop_name,
            owner_fio=row.owner_fio,
            delivery_type=seller.delivery_type,
            city_name=row.city_name,
            district_name=row.district_name,
            metro_name=row.metro_name,
            available_slots=available_slots,
            min_price=float(row.min_price) if row.min_price else None,
            max_price=float(row.max_price) if row.max_price else None,
            product_count=row.product_count or 0
        ))
    
    return PublicSellersResponse(
        sellers=sellers,
        total=total,
        page=page,
        per_page=per_page
    )


@router.get("/sellers/{seller_id}", response_model=PublicSellerDetail)
async def get_public_seller_detail(
    seller_id: int,
    session: AsyncSession = Depends(get_session)
):
    """
    Получить публичный профиль продавца с товарами.
    """
    now = datetime.utcnow()
    
    # Получаем продавца с джойнами
    query = (
        select(
            Seller,
            City.name.label("city_name"),
            District.name.label("district_name"),
            Metro.name.label("metro_name")
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
    
    # Проверяем доступность
    if seller.deleted_at:
        raise HTTPException(status_code=404, detail="Продавец не найден")
    
    if seller.is_blocked:
        raise HTTPException(status_code=403, detail="Продавец заблокирован")
    
    if seller.placement_expired_at and seller.placement_expired_at < now:
        raise HTTPException(status_code=403, detail="Размещение продавца истекло")
    
    available_slots = seller.max_orders - seller.active_orders - seller.pending_requests
    
    # Получаем товары
    products_query = (
        select(Product)
        .where(
            Product.seller_id == seller_id,
            Product.is_active == True
        )
        .order_by(Product.price.asc())
    )
    products_result = await session.execute(products_query)
    products = products_result.scalars().all()
    
    products_list = [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "price": float(p.price),
            "photo_id": p.photo_id
        }
        for p in products
    ]
    
    return PublicSellerDetail(
        seller_id=seller.seller_id,
        shop_name=seller.shop_name,
        description=seller.description,
        delivery_type=seller.delivery_type,
        map_url=seller.map_url,
        city_name=row.city_name,
        district_name=row.district_name,
        metro_name=row.metro_name,
        available_slots=available_slots,
        products=products_list
    )


@router.get("/metro/{district_id}", response_model=List[MetroResponse])
async def get_metro_stations(
    district_id: int,
    session: AsyncSession = Depends(get_session)
):
    """
    Получить список станций метро в районе.
    """
    query = (
        select(Metro)
        .where(Metro.district_id == district_id)
        .order_by(Metro.name)
    )
    
    result = await session.execute(query)
    stations = result.scalars().all()
    
    return [
        MetroResponse(id=s.id, name=s.name, district_id=s.district_id)
        for s in stations
    ]


@router.get("/cities", response_model=List[CityResponse])
async def get_cities(session: AsyncSession = Depends(get_session)):
    """
    Получить список всех городов.
    """
    query = select(City).order_by(City.name)
    result = await session.execute(query)
    cities = result.scalars().all()
    
    return [CityResponse(id=c.id, name=c.name) for c in cities]


@router.get("/districts/{city_id}", response_model=List[DistrictResponse])
async def get_districts(
    city_id: int,
    session: AsyncSession = Depends(get_session)
):
    """
    Получить список районов города.
    """
    query = (
        select(District)
        .where(District.city_id == city_id)
        .order_by(District.name)
    )
    
    result = await session.execute(query)
    districts = result.scalars().all()
    
    return [
        DistrictResponse(id=d.id, name=d.name, city_id=d.city_id)
        for d in districts
    ]
