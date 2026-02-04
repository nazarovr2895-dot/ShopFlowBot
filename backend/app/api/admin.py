import os
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

from backend.app.api.deps import get_session, get_cache
from backend.app.core.logging import get_logger
from backend.app.core.password_utils import hash_password
from backend.app.services.sellers import (
    SellerService,
    SellerServiceError,
    SellerNotFoundError,
)
from backend.app.services.orders import OrderService
from backend.app.services.agents import (
    AgentService,
    AgentServiceError,
    AgentNotFoundError,
    NotAnAgentError,
)
from backend.app.services.cache import CacheService

router = APIRouter()
logger = get_logger(__name__)

# Admin panel auth: when ADMIN_SECRET is set, require X-Admin-Token header
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "")


async def require_admin_token(x_admin_token: Optional[str] = Header(None, alias="X-Admin-Token")):
    """Require admin token when ADMIN_SECRET is configured. Otherwise allow all."""
    if not ADMIN_SECRET:
        return
    if not x_admin_token or x_admin_token != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Invalid or missing admin token")


def _handle_seller_error(e: SellerServiceError):
    """Convert seller service exceptions to HTTP exceptions."""
    raise HTTPException(status_code=e.status_code, detail=e.message)


def _handle_agent_error(e: AgentServiceError):
    """Convert agent service exceptions to HTTP exceptions."""
    raise HTTPException(status_code=e.status_code, detail=e.message)


# ============================================
# SCHEMAS
# ============================================

class SellerCreateSchema(BaseModel):
    tg_id: int
    fio: str
    phone: str
    shop_name: str
    description: Optional[str] = None
    city_id: Optional[int] = None
    district_id: Optional[int] = None
    map_url: Optional[str] = None
    metro_id: Optional[int] = None
    metro_walk_minutes: Optional[int] = None
    delivery_type: str
    delivery_price: float = 0.0
    placement_expired_at: Optional[datetime] = None


class SellerUpdateSchema(BaseModel):
    field: str
    value: str


class SellerStatsResponse(BaseModel):
    fio: str
    orders_count: int
    total_sales: float
    platform_profit: float


class AgentResponse(BaseModel):
    tg_id: int
    fio: Optional[str]
    phone: Optional[str]
    age: Optional[int]
    is_self_employed: bool
    balance: float
    referrals_count: int
    created_at: Optional[str]


# ============================================
# СПРАВОЧНИКИ (ГОРОДА, ОКРУГА)
# ============================================

@router.get("/cities")
async def get_cities(session: AsyncSession = Depends(get_session)):
    """Получить список городов"""
    service = SellerService(session)
    return await service.get_cities()


@router.get("/districts/{city_id}")
async def get_districts(city_id: int, session: AsyncSession = Depends(get_session)):
    """Получить список округов по городу"""
    service = SellerService(session)
    return await service.get_districts(city_id)


# ============================================
# УПРАВЛЕНИЕ ПРОДАВЦАМИ
# ============================================

@router.post("/create_seller")
async def create_seller_api(data: SellerCreateSchema, session: AsyncSession = Depends(get_session)):
    """Создать продавца с полными данными. Автоматически генерирует логин и пароль для веб-панели."""
    logger.info(
        "Creating seller",
        tg_id=data.tg_id,
        shop_name=data.shop_name,
        city_id=data.city_id,
    )
    service = SellerService(session)
    result = await service.create_seller(
        tg_id=data.tg_id,
        fio=data.fio,
        phone=data.phone,
        shop_name=data.shop_name,
        description=data.description,
        city_id=data.city_id,
        district_id=data.district_id,
        map_url=data.map_url,
        metro_id=data.metro_id,
        metro_walk_minutes=data.metro_walk_minutes,
        delivery_type=data.delivery_type,
        delivery_price=data.delivery_price,
        placement_expired_at=data.placement_expired_at,
    )
    logger.info("Seller created", tg_id=data.tg_id, shop_name=data.shop_name)
    return result


@router.get("/sellers/search")
async def search_sellers(
    fio: str,
    include_deleted: bool = False,
    session: AsyncSession = Depends(get_session)
):
    """Поиск продавцов по ФИО. По умолчанию не включает soft-deleted."""
    service = SellerService(session)
    return await service.search(fio, include_deleted)


@router.get("/sellers/all")
async def list_all_sellers(
    include_deleted: bool = False,
    session: AsyncSession = Depends(get_session)
):
    """Список всех продавцов. По умолчанию не включает soft-deleted."""
    service = SellerService(session)
    return await service.list_all(include_deleted)


@router.put("/sellers/{tg_id}/update")
async def update_seller_field(
    tg_id: int,
    data: SellerUpdateSchema,
    session: AsyncSession = Depends(get_session)
):
    """Обновить поле продавца"""
    service = SellerService(session)
    
    try:
        return await service.update_field(tg_id, data.field, data.value)
    except SellerServiceError as e:
        if isinstance(e, SellerNotFoundError):
            return {"status": "not_found"}
        _handle_seller_error(e)


@router.put("/sellers/{tg_id}/block")
async def block_seller(tg_id: int, is_blocked: bool, session: AsyncSession = Depends(get_session)):
    """Заблокировать/разблокировать продавца"""
    action = "blocking" if is_blocked else "unblocking"
    logger.info(f"Admin {action} seller", tg_id=tg_id, is_blocked=is_blocked)
    
    service = SellerService(session)
    
    try:
        result = await service.block_seller(tg_id, is_blocked)
        logger.info(f"Seller {action} completed", tg_id=tg_id)
        return result
    except SellerNotFoundError:
        logger.warning(f"Seller {action} failed: not found", tg_id=tg_id)
        return {"status": "not_found"}


@router.put("/sellers/{tg_id}/soft-delete")
async def soft_delete_seller(tg_id: int, session: AsyncSession = Depends(get_session)):
    """
    Soft Delete продавца (скрыть).
    Устанавливает deleted_at = now, сохраняя все данные и историю заказов.
    """
    logger.info("Soft deleting seller", tg_id=tg_id)
    service = SellerService(session)
    
    try:
        result = await service.soft_delete(tg_id)
        logger.info("Seller soft deleted", tg_id=tg_id)
        return result
    except SellerNotFoundError:
        logger.warning("Soft delete failed: seller not found", tg_id=tg_id)
        return {"status": "not_found"}


@router.put("/sellers/{tg_id}/restore")
async def restore_seller(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Восстановить soft-deleted продавца."""
    service = SellerService(session)
    
    try:
        return await service.restore(tg_id)
    except SellerNotFoundError:
        return {"status": "not_found"}


@router.delete("/sellers/{tg_id}")
async def delete_seller(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Удалить продавца (Hard Delete). История заказов не удаляется."""
    service = SellerService(session)
    
    try:
        return await service.hard_delete(tg_id)
    except SellerNotFoundError:
        return {"status": "not_found"}


@router.post("/sellers/{tg_id}/reset_counters")
async def reset_seller_counters(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Сбросить счетчики заказов продавца (active_orders, pending_requests)"""
    service = SellerService(session)
    
    try:
        return await service.reset_counters(tg_id)
    except SellerNotFoundError:
        return {"status": "not_found"}


@router.put("/sellers/{tg_id}/set_limit")
async def set_seller_limit(tg_id: int, max_orders: int, session: AsyncSession = Depends(get_session)):
    """Установить лимит заказов продавца (админ)"""
    service = SellerService(session)
    
    try:
        return await service.set_order_limit(tg_id, max_orders)
    except SellerNotFoundError:
        return {"status": "not_found"}
    except SellerServiceError as e:
        return {"status": "error", "message": e.message}


@router.get("/sellers/{tg_id}/web_credentials")
async def get_seller_web_credentials(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Получить текущие данные для входа. Пароль возвращается только при стандартном формате (Seller+id)."""
    from sqlalchemy import select
    from backend.app.models.seller import Seller

    try:
        result = await session.execute(select(Seller).where(Seller.seller_id == tg_id))
        seller = result.scalar_one_or_none()
        if not seller:
            return {"status": "not_found", "web_login": None, "web_password": None}
        web_login = getattr(seller, "web_login", None)
        if not web_login:
            return {"status": "ok", "web_login": None, "web_password": None}
        is_standard = web_login == f"Seller{tg_id}"
        return {
            "status": "ok",
            "web_login": web_login,
            "web_password": str(tg_id) if is_standard else None,
        }
    except Exception as e:
        logger.exception("get_web_credentials failed", tg_id=tg_id, error=str(e))
        return {"status": "error", "web_login": None, "web_password": None}


@router.post("/sellers/{tg_id}/set_web_credentials")
async def set_seller_web_credentials(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Установить логин и пароль для веб-панели: login=Seller{tg_id}, password={tg_id}."""
    from sqlalchemy import select
    from sqlalchemy.exc import IntegrityError
    from backend.app.models.seller import Seller

    try:
        result = await session.execute(select(Seller).where(Seller.seller_id == tg_id))
        seller = result.scalar_one_or_none()
        if not seller:
            return {"status": "not_found"}
        web_login = f"Seller{tg_id}"
        web_password = str(tg_id)
        seller.web_login = web_login
        seller.web_password_hash = hash_password(web_password)
        await session.commit()
        return {"status": "ok", "web_login": web_login, "web_password": web_password}
    except IntegrityError:
        await session.rollback()
        logger.exception("set_web_credentials IntegrityError", tg_id=tg_id)
        raise HTTPException(status_code=400, detail="Ошибка: такой логин уже используется другим продавцом")
    except Exception as e:
        await session.rollback()
        logger.exception("set_web_credentials failed", tg_id=tg_id, error=str(e))
        err_msg = str(e)
        if "web_login" in err_msg or "web_password" in err_msg or "column" in err_msg.lower():
            raise HTTPException(status_code=500, detail="Ошибка БД. Выполните миграции: python run_migrations.py")
        raise HTTPException(status_code=500, detail=err_msg)


# ============================================
# СТАТИСТИКА
# ============================================

@router.get("/stats/all")
async def get_all_stats(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    """Общая статистика всех продавцов. Опционально: date_from, date_to (дата YYYY-MM-DD)."""
    from datetime import datetime as dt, time
    service = SellerService(session)
    d_from = None
    d_to = None
    if date_from:
        d_from = dt.combine(dt.fromisoformat(date_from[:10]).date(), time.min)
    if date_to:
        d_to = dt.combine(dt.fromisoformat(date_to[:10]).date(), time.max)
    return await service.get_all_stats(date_from=d_from, date_to=d_to)


@router.get("/stats/overview")
async def get_stats_overview(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    """Дневная статистика по платформе для графика (выполненные заказы). date_from, date_to — YYYY-MM-DD."""
    from datetime import datetime as dt, time
    d_from = None
    d_to = None
    if date_from:
        d_from = dt.combine(dt.fromisoformat(date_from[:10]).date(), time.min)
    if date_to:
        d_to = dt.combine(dt.fromisoformat(date_to[:10]).date(), time.max)
    order_service = OrderService(session)
    return await order_service.get_platform_daily_stats(date_from=d_from, date_to=d_to)


@router.get("/stats/seller")
async def get_seller_stats(fio: str, session: AsyncSession = Depends(get_session)):
    """Статистика конкретного продавца по ФИО"""
    service = SellerService(session)
    return await service.get_seller_stats_by_fio(fio)


@router.get("/stats/agents")
async def get_agents_stats(session: AsyncSession = Depends(get_session)):
    """Статистика по агентам"""
    service = AgentService(session)
    return await service.get_agents_stats()


# ============================================
# УПРАВЛЕНИЕ АГЕНТАМИ (ПОСРЕДНИКАМИ)
# ============================================

@router.get("/agents/all", response_model=List[AgentResponse])
async def list_all_agents(session: AsyncSession = Depends(get_session)):
    """Получить список всех агентов (пользователей с role='AGENT')"""
    service = AgentService(session)
    return await service.list_all_agents()


@router.get("/agents/search")
async def search_agents(
    query: str,
    session: AsyncSession = Depends(get_session)
):
    """Поиск агентов по ФИО или Telegram ID"""
    service = AgentService(session)
    return await service.search_agents(query)


@router.get("/agents/{tg_id}")
async def get_agent_details(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Получить детальную информацию об агенте"""
    service = AgentService(session)
    
    try:
        return await service.get_agent_details(tg_id)
    except AgentNotFoundError:
        return {"status": "not_found"}


@router.put("/agents/{tg_id}/remove")
async def remove_agent_status(tg_id: int, session: AsyncSession = Depends(get_session)):
    """
    Снять статус агента (переводит role на BUYER).
    Не удаляет пользователя, только меняет роль.
    """
    logger.info("Removing agent status", tg_id=tg_id)
    service = AgentService(session)
    
    try:
        result = await service.remove_agent_status(tg_id)
        logger.info("Agent status removed", tg_id=tg_id)
        return result
    except AgentNotFoundError:
        logger.warning("Remove agent failed: not found", tg_id=tg_id)
        return {"status": "not_found"}
    except NotAnAgentError:
        logger.warning("Remove agent failed: not an agent", tg_id=tg_id)
        return {"status": "not_agent", "message": "Пользователь не является агентом"}


@router.put("/agents/{tg_id}/set_balance")
async def set_agent_balance(
    tg_id: int,
    new_balance: float,
    session: AsyncSession = Depends(get_session)
):
    """Установить баланс агента (для корректировок)"""
    logger.info("Setting agent balance", tg_id=tg_id, new_balance=new_balance)
    service = AgentService(session)
    
    try:
        result = await service.set_balance(tg_id, new_balance)
        logger.info("Agent balance updated", tg_id=tg_id, new_balance=new_balance)
        return result
    except AgentNotFoundError:
        logger.warning("Set balance failed: agent not found", tg_id=tg_id)
        return {"status": "not_found"}
    except AgentServiceError as e:
        logger.error("Set balance failed", tg_id=tg_id, error=e.message)
        return {"status": "error", "message": e.message}


@router.get("/agents/{tg_id}/referrals")
async def get_agent_referrals(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Получить список рефералов агента"""
    service = AgentService(session)
    
    try:
        return await service.get_agent_referrals(tg_id)
    except AgentNotFoundError:
        return {"status": "not_found"}


# ============================================
# КЭШИРОВАНИЕ
# ============================================

@router.post("/cache/invalidate")
async def invalidate_cache(
    cache_type: Optional[str] = None,
    cache: CacheService = Depends(get_cache)
):
    """
    Сбросить кэш справочников.
    
    - cache_type=None: сбросить весь кэш (города, районы, метро)
    - cache_type="cities": сбросить только кэш городов
    - cache_type="districts": сбросить только кэш районов
    - cache_type="metro": сбросить только кэш метро
    """
    logger.info("Cache invalidation requested", cache_type=cache_type or "all")
    
    if cache_type is None:
        await cache.invalidate_all_references()
        logger.info("Cache invalidated", cache_type="all")
        return {"status": "ok", "invalidated": "all"}
    elif cache_type == "cities":
        await cache.invalidate_cities()
        logger.info("Cache invalidated", cache_type="cities")
        return {"status": "ok", "invalidated": "cities"}
    elif cache_type == "districts":
        await cache.invalidate_districts()
        logger.info("Cache invalidated", cache_type="districts")
        return {"status": "ok", "invalidated": "districts"}
    elif cache_type == "metro":
        await cache.invalidate_metro()
        logger.info("Cache invalidated", cache_type="metro")
        return {"status": "ok", "invalidated": "metro"}
    else:
        logger.warning("Invalid cache type requested", cache_type=cache_type)
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid cache_type: {cache_type}. Use: cities, districts, metro, or omit for all."
        )
