from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
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
async def search_sellers(
    fio: str,
    include_deleted: bool = False,
    session: AsyncSession = Depends(get_session)
):
    """Поиск продавцов по ФИО. По умолчанию не включает soft-deleted."""
    conditions = [User.fio.ilike(f"%{fio}%")]
    
    # Включаем роль SELLER или BUYER (если продавец был soft-deleted, роль меняется на BUYER)
    if include_deleted:
        # При поиске с удаленными - ищем по всем, у кого есть запись Seller
        pass
    else:
        # Исключаем soft-deleted
        conditions.append(Seller.deleted_at.is_(None))
    
    result = await session.execute(
        select(User, Seller)
        .join(Seller, User.tg_id == Seller.seller_id)
        .where(*conditions)
    )
    sellers = []
    for user, seller in result.all():
        sellers.append({
            "tg_id": user.tg_id,
            "fio": user.fio,
            "phone": user.phone,
            "shop_name": seller.shop_name,
            "is_blocked": seller.is_blocked,
            "is_deleted": seller.deleted_at is not None,
            "deleted_at": seller.deleted_at.isoformat() if seller.deleted_at else None
        })
    return sellers

@router.get("/sellers/all")
async def list_all_sellers(
    include_deleted: bool = False,
    session: AsyncSession = Depends(get_session)
):
    """Список всех продавцов. По умолчанию не включает soft-deleted."""
    conditions = []
    
    if not include_deleted:
        conditions.append(Seller.deleted_at.is_(None))
    
    query = select(User, Seller).join(Seller, User.tg_id == Seller.seller_id)
    
    if conditions:
        query = query.where(*conditions)
    
    result = await session.execute(query)
    sellers = []
    for user, seller in result.all():
        sellers.append({
            "tg_id": user.tg_id,
            "fio": user.fio,
            "phone": user.phone,
            "shop_name": seller.shop_name,
            "is_blocked": seller.is_blocked,
            "is_deleted": seller.deleted_at is not None,
            "deleted_at": seller.deleted_at.isoformat() if seller.deleted_at else None
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

@router.put("/sellers/{tg_id}/soft-delete")
async def soft_delete_seller(tg_id: int, session: AsyncSession = Depends(get_session)):
    """
    Soft Delete продавца (скрыть).
    Устанавливает deleted_at = now, сохраняя все данные и историю заказов.
    Продавец не отображается в публичных списках, но данные сохраняются.
    """
    seller = await session.get(Seller, tg_id)
    if not seller:
        return {"status": "not_found"}
    
    # Устанавливаем timestamp удаления
    seller.deleted_at = datetime.utcnow()
    
    # Меняем роль пользователя на BUYER
    user = await session.get(User, tg_id)
    if user and user.role != 'ADMIN':
        user.role = 'BUYER'
    
    await session.commit()
    return {"status": "ok", "message": "Продавец скрыт (soft delete)"}


@router.put("/sellers/{tg_id}/restore")
async def restore_seller(tg_id: int, session: AsyncSession = Depends(get_session)):
    """
    Восстановить soft-deleted продавца.
    """
    seller = await session.get(Seller, tg_id)
    if not seller:
        return {"status": "not_found"}
    
    if not seller.deleted_at:
        return {"status": "not_deleted", "message": "Продавец не был удален"}
    
    # Убираем timestamp удаления
    seller.deleted_at = None
    
    # Восстанавливаем роль пользователя
    user = await session.get(User, tg_id)
    if user and user.role == 'BUYER':
        user.role = 'SELLER'
    
    await session.commit()
    return {"status": "ok", "message": "Продавец восстановлен"}


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


# ============================================
# УПРАВЛЕНИЕ АГЕНТАМИ (ПОСРЕДНИКАМИ)
# ============================================

class AgentResponse(BaseModel):
    tg_id: int
    fio: Optional[str]
    phone: Optional[str]
    age: Optional[int]
    is_self_employed: bool
    balance: float
    referrals_count: int
    created_at: Optional[str]


@router.get("/agents/all", response_model=List[AgentResponse])
async def list_all_agents(session: AsyncSession = Depends(get_session)):
    """Получить список всех агентов (пользователей с role='AGENT')"""
    # Получаем всех агентов
    result = await session.execute(
        select(User).where(User.role == 'AGENT')
    )
    agents = result.scalars().all()
    
    agent_list = []
    for agent in agents:
        # Считаем количество рефералов для каждого агента
        ref_count_result = await session.execute(
            select(func.count()).select_from(User).where(User.referrer_id == agent.tg_id)
        )
        referrals_count = ref_count_result.scalar() or 0
        
        agent_list.append(AgentResponse(
            tg_id=agent.tg_id,
            fio=agent.fio,
            phone=agent.phone,
            age=agent.age,
            is_self_employed=agent.is_self_employed or False,
            balance=float(agent.balance) if agent.balance else 0.0,
            referrals_count=referrals_count,
            created_at=agent.created_at.isoformat() if agent.created_at else None
        ))
    
    return agent_list


@router.get("/agents/search")
async def search_agents(
    query: str,
    session: AsyncSession = Depends(get_session)
):
    """Поиск агентов по ФИО или Telegram ID"""
    conditions = [User.role == 'AGENT']
    
    # Если запрос - число, ищем также по tg_id
    if query.isdigit():
        conditions.append(
            (User.fio.ilike(f"%{query}%")) | (User.tg_id == int(query))
        )
    else:
        conditions.append(User.fio.ilike(f"%{query}%"))
    
    result = await session.execute(
        select(User).where(*conditions)
    )
    agents = result.scalars().all()
    
    agent_list = []
    for agent in agents:
        # Считаем количество рефералов
        ref_count_result = await session.execute(
            select(func.count()).select_from(User).where(User.referrer_id == agent.tg_id)
        )
        referrals_count = ref_count_result.scalar() or 0
        
        agent_list.append({
            "tg_id": agent.tg_id,
            "fio": agent.fio,
            "phone": agent.phone,
            "age": agent.age,
            "is_self_employed": agent.is_self_employed or False,
            "balance": float(agent.balance) if agent.balance else 0.0,
            "referrals_count": referrals_count,
            "created_at": agent.created_at.isoformat() if agent.created_at else None
        })
    
    return agent_list


@router.get("/agents/{tg_id}")
async def get_agent_details(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Получить детальную информацию об агенте"""
    # Получаем агента
    result = await session.execute(select(User).where(User.tg_id == tg_id))
    agent = result.scalar_one_or_none()
    
    if not agent:
        return {"status": "not_found"}
    
    # Считаем прямых рефералов (Level 1)
    level1_result = await session.execute(
        select(User).where(User.referrer_id == tg_id)
    )
    level1_users = level1_result.scalars().all()
    level1_count = len(level1_users)
    level1_ids = [u.tg_id for u in level1_users]
    
    # Считаем рефералов Level 2 (приглашенные агентами)
    level2_count = 0
    agents_invited = 0
    
    invited_agents = [u for u in level1_users if u.role == 'AGENT']
    agents_invited = len(invited_agents)
    invited_agent_ids = [u.tg_id for u in invited_agents]
    
    if invited_agent_ids:
        level2_result = await session.execute(
            select(func.count()).select_from(User).where(User.referrer_id.in_(invited_agent_ids))
        )
        level2_count = level2_result.scalar() or 0
    
    # Считаем заработок Level 1 (7% от заказов прямых рефералов)
    earnings_level_1 = 0.0
    if level1_ids:
        level1_orders_result = await session.execute(
            select(func.coalesce(func.sum(Order.total_price), 0))
            .where(
                Order.buyer_id.in_(level1_ids),
                Order.status.in_(["done", "completed", "delivered"])
            )
        )
        level1_total = level1_orders_result.scalar() or 0
        earnings_level_1 = float(level1_total) * 0.07
    
    # Считаем заработок Level 2 (2% от заказов рефералов агентов)
    earnings_level_2 = 0.0
    if invited_agent_ids:
        # Получаем ID рефералов приглашенных агентов
        level2_ids_result = await session.execute(
            select(User.tg_id).where(User.referrer_id.in_(invited_agent_ids))
        )
        level2_ids = [r[0] for r in level2_ids_result.fetchall()]
        
        if level2_ids:
            level2_orders_result = await session.execute(
                select(func.coalesce(func.sum(Order.total_price), 0))
                .where(
                    Order.buyer_id.in_(level2_ids),
                    Order.status.in_(["done", "completed", "delivered"])
                )
            )
            level2_total = level2_orders_result.scalar() or 0
            earnings_level_2 = float(level2_total) * 0.02
    
    # Список приглашенных агентов с их статистикой
    invited_agents_info = []
    for inv_agent in invited_agents:
        # Количество рефералов у приглашенного агента
        inv_ref_result = await session.execute(
            select(func.count()).select_from(User).where(User.referrer_id == inv_agent.tg_id)
        )
        inv_ref_count = inv_ref_result.scalar() or 0
        
        invited_agents_info.append({
            "tg_id": inv_agent.tg_id,
            "fio": inv_agent.fio,
            "referrals_count": inv_ref_count
        })
    
    return {
        "status": "ok",
        "agent": {
            "tg_id": agent.tg_id,
            "fio": agent.fio,
            "phone": agent.phone,
            "age": agent.age,
            "is_self_employed": agent.is_self_employed or False,
            "balance": float(agent.balance) if agent.balance else 0.0,
            "created_at": agent.created_at.isoformat() if agent.created_at else None
        },
        "stats": {
            "referrals_level_1": level1_count,
            "referrals_level_2": level2_count,
            "agents_invited": agents_invited,
            "earnings_level_1": round(earnings_level_1, 2),
            "earnings_level_2": round(earnings_level_2, 2),
            "total_earnings": round(earnings_level_1 + earnings_level_2, 2)
        },
        "invited_agents": invited_agents_info
    }


@router.put("/agents/{tg_id}/remove")
async def remove_agent_status(tg_id: int, session: AsyncSession = Depends(get_session)):
    """
    Снять статус агента (переводит role на BUYER).
    Не удаляет пользователя, только меняет роль.
    """
    user = await session.get(User, tg_id)
    if not user:
        return {"status": "not_found"}
    
    if user.role != 'AGENT':
        return {"status": "not_agent", "message": "Пользователь не является агентом"}
    
    # Меняем роль на BUYER
    user.role = 'BUYER'
    await session.commit()
    
    return {"status": "ok", "message": "Статус агента снят"}


@router.put("/agents/{tg_id}/set_balance")
async def set_agent_balance(
    tg_id: int,
    new_balance: float,
    session: AsyncSession = Depends(get_session)
):
    """Установить баланс агента (для корректировок)"""
    user = await session.get(User, tg_id)
    if not user:
        return {"status": "not_found"}
    
    if new_balance < 0:
        return {"status": "error", "message": "Баланс не может быть отрицательным"}
    
    user.balance = new_balance
    await session.commit()
    
    return {"status": "ok", "new_balance": new_balance}


@router.get("/agents/{tg_id}/referrals")
async def get_agent_referrals(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Получить список рефералов агента"""
    # Проверяем, существует ли агент
    agent = await session.get(User, tg_id)
    if not agent:
        return {"status": "not_found"}
    
    # Получаем всех прямых рефералов
    result = await session.execute(
        select(User).where(User.referrer_id == tg_id)
    )
    referrals = result.scalars().all()
    
    referrals_list = []
    for ref in referrals:
        # Считаем количество заказов от этого реферала
        orders_result = await session.execute(
            select(func.count(Order.id), func.coalesce(func.sum(Order.total_price), 0))
            .where(
                Order.buyer_id == ref.tg_id,
                Order.status.in_(["done", "completed", "delivered"])
            )
        )
        orders_row = orders_result.first()
        orders_count = orders_row[0] if orders_row else 0
        orders_sum = float(orders_row[1]) if orders_row and orders_row[1] else 0.0
        
        referrals_list.append({
            "tg_id": ref.tg_id,
            "fio": ref.fio,
            "role": ref.role,
            "orders_count": orders_count,
            "orders_sum": orders_sum,
            "created_at": ref.created_at.isoformat() if ref.created_at else None
        })
    
    return {
        "status": "ok",
        "referrals": referrals_list,
        "total": len(referrals_list)
    }