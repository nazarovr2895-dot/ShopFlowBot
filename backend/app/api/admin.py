from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from backend.app.api.deps import get_session
from backend.app.models.seller import Seller, City, District
from backend.app.models.user import User
from backend.app.models.order import Order
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

router = APIRouter()

class SellerCreateSchema(BaseModel):
    tg_id: int
    fio: str
    phone: str
    shop_name: str
    description: Optional[str] = None
    city_id: Optional[int] = None
    district_id: Optional[int] = None
    map_url: Optional[str] = None
    delivery_type: str
    placement_expired_at: Optional[datetime] = None

class SellerUpdateSchema(BaseModel):
    field: str
    value: str

class SellerStatsResponse(BaseModel):
    fio: str
    orders_count: int
    total_sales: float
    platform_profit: float

@router.get("/cities")
async def get_cities(session: AsyncSession = Depends(get_session)):
    """Получить список городов"""
    result = await session.execute(select(City))
    cities = result.scalars().all()
    return [{"id": c.id, "name": c.name} for c in cities]

@router.get("/districts/{city_id}")
async def get_districts(city_id: int, session: AsyncSession = Depends(get_session)):
    """Получить список округов по городу"""
    result = await session.execute(select(District).where(District.city_id == city_id))
    districts = result.scalars().all()
    return [{"id": d.id, "name": d.name} for d in districts]

@router.post("/create_seller")
async def create_seller_api(data: SellerCreateSchema, session: AsyncSession = Depends(get_session)):
    """Создать продавца с полными данными"""
    # 1. Проверяем, есть ли такой продавец
    result = await session.execute(select(Seller).where(Seller.seller_id == data.tg_id))
    if result.scalar_one_or_none():
        return {"status": "exists"}

    # 2. Создаем или обновляем пользователя
    user_res = await session.execute(select(User).where(User.tg_id == data.tg_id))
    user = user_res.scalar_one_or_none()
    if not user:
        user = User(
            tg_id=data.tg_id,
            fio=data.fio,
            phone=data.phone,
            role='SELLER'
        )
        session.add(user)
    else:
        # Обновляем данные, но не меняем роль если это ADMIN
        if user.role != 'ADMIN':
            user.role = 'SELLER'
        user.fio = data.fio
        user.phone = data.phone

    # 3. Гарантируем наличие города/округа (если пришли id)
    if data.city_id is not None:
        city = await session.get(City, data.city_id)
        if not city and data.city_id == 1:
            session.add(City(id=1, name="Москва"))
    if data.district_id is not None:
        district = await session.get(District, data.district_id)
        if not district:
            district_names = {
                1: "ЦАО",
                2: "САО",
                3: "СВАО",
                4: "ВАО",
                5: "ЮВАО",
                6: "ЮАО",
                7: "ЮЗАО",
                8: "ЗАО",
                9: "СЗАО",
                10: "Зеленоградский",
                11: "Новомосковский",
                12: "Троицкий",
            }
            session.add(District(
                id=data.district_id,
                city_id=data.city_id,
                name=district_names.get(data.district_id, f"Округ {data.district_id}")
            ))

    # 4. Создаем продавца
    new_seller = Seller(
        seller_id=data.tg_id,
        shop_name=data.shop_name,
        description=data.description,
        city_id=data.city_id,
        district_id=data.district_id,
        map_url=data.map_url,
        delivery_type=data.delivery_type,
        placement_expired_at=data.placement_expired_at,
        max_orders=10,  # Дефолтный лимит
        active_orders=0,
        pending_requests=0
    )
    session.add(new_seller)

    await session.commit()
    return {"status": "ok"}

@router.get("/sellers/search")
async def search_sellers(fio: str, session: AsyncSession = Depends(get_session)):
    """Поиск продавцов по ФИО"""
    result = await session.execute(
        select(User, Seller)
        .join(Seller, User.tg_id == Seller.seller_id)
        .where(User.fio.ilike(f"%{fio}%"), User.role == 'SELLER')
    )
    sellers = []
    for user, seller in result.all():
        sellers.append({
            "tg_id": user.tg_id,
            "fio": user.fio,
            "phone": user.phone,
            "shop_name": seller.shop_name,
            "is_blocked": seller.is_blocked
        })
    return sellers

@router.get("/sellers/all")
async def list_all_sellers(session: AsyncSession = Depends(get_session)):
    """Список всех продавцов"""
    result = await session.execute(
        select(User, Seller)
        .join(Seller, User.tg_id == Seller.seller_id)
        .where(User.role == 'SELLER')
    )
    sellers = []
    for user, seller in result.all():
        sellers.append({
            "tg_id": user.tg_id,
            "fio": user.fio,
            "phone": user.phone,
            "shop_name": seller.shop_name,
            "is_blocked": seller.is_blocked
        })
    return sellers

@router.put("/sellers/{tg_id}/update")
async def update_seller_field(
    tg_id: int,
    data: SellerUpdateSchema,
    session: AsyncSession = Depends(get_session)
):
    """Обновить поле продавца"""
    # Получаем пользователя и продавца
    user = await session.get(User, tg_id)
    seller = await session.get(Seller, tg_id)
    
    if not user or not seller:
        return {"status": "not_found"}
    
    # Обновляем поле в зависимости от типа
    field = data.field
    value = data.value
    
    if field == "fio":
        user.fio = value
    elif field == "phone":
        user.phone = value
    elif field == "shop_name":
        seller.shop_name = value
    elif field == "description":
        seller.description = value
    elif field == "map_url":
        seller.map_url = value
    elif field == "delivery_type":
        seller.delivery_type = value
    elif field == "city_id":
        seller.city_id = int(value) if value.isdigit() else None
    elif field == "district_id":
        seller.district_id = int(value) if value.isdigit() else None
    else:
        return {"status": "invalid_field"}
    
    await session.commit()
    return {"status": "ok"}

@router.put("/sellers/{tg_id}/block")
async def block_seller(tg_id: int, is_blocked: bool, session: AsyncSession = Depends(get_session)):
    """Заблокировать/разблокировать продавца (Soft Delete)"""
    seller = await session.get(Seller, tg_id)
    if not seller:
        return {"status": "not_found"}
    
    seller.is_blocked = is_blocked
    await session.commit()
    return {"status": "ok"}

@router.delete("/sellers/{tg_id}")
async def delete_seller(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Удалить продавца (Hard Delete). История заказов не удаляется."""
    seller = await session.get(Seller, tg_id)
    if not seller:
        return {"status": "not_found"}
    
    # Меняем роль пользователя на BUYER, но не удаляем его
    user = await session.get(User, tg_id)
    if user and user.role != 'ADMIN':
        user.role = 'BUYER'
    
    # Удаляем продавца
    await session.delete(seller)
    await session.commit()
    return {"status": "ok"}

@router.get("/stats/all")
async def get_all_stats(session: AsyncSession = Depends(get_session)):
    """Общая статистика всех продавцов"""
    # Получаем комиссию платформы (18% по умолчанию)
    commission_percent = 18  # Можно вынести в настройки
    
    result = await session.execute(
        select(
            User.fio,
            func.count(Order.id).label('orders_count'),
            func.sum(Order.total_price).label('total_sales')
        )
        .join(Order, User.tg_id == Order.seller_id)
        .where(Order.status == 'delivered')
        .group_by(User.fio)
    )
    
    stats = []
    for row in result.all():
        total_sales = float(row.total_sales) if row.total_sales else 0.0
        platform_profit = total_sales * (commission_percent / 100)
        stats.append({
            "fio": row.fio,
            "orders_count": row.orders_count,
            "total_sales": total_sales,
            "platform_profit": platform_profit
        })
    
    return stats

@router.get("/stats/seller")
async def get_seller_stats(fio: str, session: AsyncSession = Depends(get_session)):
    """Статистика конкретного продавца по ФИО"""
    commission_percent = 18
    
    result = await session.execute(
        select(
            User.fio,
            func.count(Order.id).label('orders_count'),
            func.sum(Order.total_price).label('total_sales')
        )
        .join(Order, User.tg_id == Order.seller_id)
        .where(Order.status == 'delivered', User.fio.ilike(f"%{fio}%"))
        .group_by(User.fio)
    )
    
    row = result.first()
    if not row:
        return None
    
    total_sales = float(row.total_sales) if row.total_sales else 0.0
    platform_profit = total_sales * (commission_percent / 100)
    
    return {
        "fio": row.fio,
        "orders_count": row.orders_count,
        "total_sales": total_sales,
        "platform_profit": platform_profit
    }

@router.get("/stats/agents")
async def get_agents_stats(session: AsyncSession = Depends(get_session)):
    """Статистика по агентам"""
    result = await session.execute(
        select(
            User.fio,
            func.count(Order.id).label('orders_count'),
            func.sum(Order.total_price).label('total_sales')
        )
        .join(Order, User.tg_id == Order.agent_id)
        .where(Order.status == 'delivered', Order.agent_id.isnot(None))
        .group_by(User.fio)
    )
    
    stats = []
    for row in result.all():
        total_sales = float(row.total_sales) if row.total_sales else 0.0
        stats.append({
            "fio": row.fio,
            "orders_count": row.orders_count,
            "total_sales": total_sales
        })
    
    return stats


@router.post("/sellers/{tg_id}/reset_counters")
async def reset_seller_counters(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Сбросить счетчики заказов продавца (active_orders, pending_requests)"""
    seller = await session.get(Seller, tg_id)
    if not seller:
        return {"status": "not_found"}
    
    seller.active_orders = 0
    seller.pending_requests = 0
    await session.commit()
    return {"status": "ok", "message": "Счетчики сброшены"}


@router.put("/sellers/{tg_id}/set_limit")
async def set_seller_limit(tg_id: int, max_orders: int, session: AsyncSession = Depends(get_session)):
    """Установить лимит заказов продавца (админ)"""
    seller = await session.get(Seller, tg_id)
    if not seller:
        return {"status": "not_found"}
    
    if max_orders < 0 or max_orders > 1000:
        return {"status": "error", "message": "Лимит должен быть от 0 до 1000"}
    
    seller.max_orders = max_orders
    await session.commit()
    return {"status": "ok", "max_orders": max_orders}