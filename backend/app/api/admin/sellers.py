"""УПРАВЛЕНИЕ ПРОДАВЦАМИ — seller CRUD, block/delete, update field, credentials, branches, commission, etc."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from decimal import Decimal

from backend.app.api.deps import get_session
from backend.app.core.password_utils import hash_password
from backend.app.services.sellers import (
    SellerService,
    SellerServiceError,
    SellerNotFoundError,
)
from backend.app.api.admin._common import (
    require_admin_token,
    _handle_seller_error,
    SellerCreateSchema,
    SellerUpdateSchema,
    logger,
)

router = APIRouter()


@router.post("/create_seller")
async def create_seller_api(data: SellerCreateSchema, session: AsyncSession = Depends(get_session), _token: None = Depends(require_admin_token)):
    """Создать продавца с полными данными. Автоматически генерирует ID, логин и пароль для веб-панели."""
    try:
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
            inn=data.inn,
            ogrn=data.ogrn,
            description=data.description,
            city_id=data.city_id,
            district_id=data.district_id,
            address_name=data.address_name,
            map_url=data.map_url,
            metro_id=data.metro_id,
            metro_walk_minutes=data.metro_walk_minutes,
            delivery_type=data.delivery_type,
            placement_expired_at=data.placement_expired_at,
            commission_percent=data.commission_percent,
            max_branches=data.max_branches,
        )
        created_tg_id = result.get("tg_id") or data.tg_id
        logger.info("Seller created", tg_id=created_tg_id, shop_name=data.shop_name)

        # Auto-create delivery zone if requested and district is set
        if data.auto_create_delivery_zone and data.district_id and result.get("status") == "ok":
            try:
                from backend.app.services.delivery_zones import DeliveryZoneService
                from backend.app.models.seller import District, Seller

                district = await session.get(District, data.district_id)
                zone_name = district.name if district else "Зона доставки"

                zone_svc = DeliveryZoneService(session)
                await zone_svc.create_zone(created_tg_id, {
                    "name": zone_name,
                    "district_ids": [data.district_id],
                    "delivery_price": 0,
                    "is_active": True,
                    "priority": 0,
                })

                seller = await session.get(Seller, created_tg_id)
                if seller:
                    seller.use_delivery_zones = True

                await session.commit()
                result["delivery_zone_created"] = True
                logger.info("Auto-created delivery zone", tg_id=created_tg_id, district=zone_name)
            except Exception as e:
                logger.error("Failed to auto-create delivery zone", exc_info=e)
                result["delivery_zone_created"] = False

        return result
    except SellerServiceError as e:
        _handle_seller_error(e)
    except Exception as e:
        logger.error("Unexpected error creating seller", exc_info=e)
        raise HTTPException(status_code=500, detail=f"Ошибка при создании продавца: {str(e)}")


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
    except SellerServiceError as e:
        return {"status": "error", "message": e.message}


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


@router.get("/sellers/{tg_id}/subscription")
async def get_seller_subscription(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Получить текущую подписку и историю для продавца."""
    from backend.app.services.subscription import SubscriptionService
    sub_service = SubscriptionService(session)
    active = await sub_service.get_active_subscription(tg_id)
    history = await sub_service.get_subscription_history(tg_id)
    return {"active": active, "history": history}


@router.put("/sellers/{tg_id}/subscription_plan")
async def set_subscription_plan(tg_id: int, plan: str, session: AsyncSession = Depends(get_session)):
    """Изменить тарифный план продавца (free/pro/premium)."""
    service = SellerService(session)
    try:
        return await service.update_subscription_plan(tg_id, plan)
    except SellerNotFoundError:
        return {"status": "not_found"}
    except SellerServiceError as e:
        return {"status": "error", "message": e.message}


@router.put("/sellers/{tg_id}/default_limit")
async def set_default_limit(
    tg_id: int,
    max_delivery_orders: Optional[int] = Query(None, ge=0),
    max_pickup_orders: Optional[int] = Query(None, ge=0),
    session: AsyncSession = Depends(get_session),
):
    """Установить лимиты доставки/самовывоза продавца (админ). default_daily_limit = сумма."""
    service = SellerService(session)
    try:
        delivery = max_delivery_orders if max_delivery_orders is not None else 10
        pickup = max_pickup_orders if max_pickup_orders is not None else 20
        return await service.update_default_limit(
            tg_id,
            default_daily_limit=delivery + pickup,
            max_delivery_orders=max_delivery_orders,
            max_pickup_orders=max_pickup_orders,
        )
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


@router.get("/sellers/{owner_id}/branches")
async def get_seller_branches(
    owner_id: int,
    session: AsyncSession = Depends(get_session),
):
    """Список всех филиалов продавца (включая основной)."""
    from backend.app.models.seller import Seller
    result = await session.execute(
        select(Seller).where(
            Seller.owner_id == owner_id,
            Seller.deleted_at.is_(None),
        ).order_by(Seller.seller_id)
    )
    return [
        {
            "seller_id": s.seller_id,
            "shop_name": s.shop_name,
            "address_name": getattr(s, "address_name", None),
            "is_owner": s.seller_id == s.owner_id,
            "is_blocked": s.is_blocked,
        }
        for s in result.scalars().all()
    ]


@router.get("/finance/seller/{owner_id}/branches")
async def get_finance_by_branches(
    owner_id: int,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    _token: None = Depends(require_admin_token),
):
    """Финансовая разбивка по филиалам одного продавца."""
    from datetime import datetime as dt, time as time_t, timedelta, date as date_type
    from sqlalchemy import desc
    from backend.app.models.order import Order
    from backend.app.models.seller import Seller
    from backend.app.models.settings import GlobalSettings as _GS

    _gs_r = await session.execute(select(_GS).order_by(_GS.id))
    _gs = _gs_r.scalar_one_or_none()
    _global_pct = _gs.commission_percent if _gs else 3

    if date_from:
        d_from = dt.combine(dt.fromisoformat(date_from[:10]).date(), time_t.min)
    else:
        d_from = dt.combine(date_type.today() - timedelta(days=30), time_t.min)
    if date_to:
        d_to = dt.combine(dt.fromisoformat(date_to[:10]).date(), time_t.max)
    else:
        d_to = dt.combine(date_type.today(), time_t.max)

    completed_statuses = ["done", "completed"]

    q = (
        select(
            Seller.seller_id,
            Seller.shop_name,
            Seller.address_name,
            Seller.commission_percent,
            func.count(Order.id).label("orders"),
            func.coalesce(func.sum(Order.total_price), 0).label("revenue"),
        )
        .join(Order, Order.seller_id == Seller.seller_id)
        .where(
            Seller.owner_id == owner_id,
            Seller.deleted_at.is_(None),
            Order.status.in_(completed_statuses),
            Order.created_at >= d_from,
            Order.created_at <= d_to,
        )
        .group_by(Seller.seller_id, Seller.shop_name, Seller.address_name, Seller.commission_percent)
        .order_by(desc("revenue"))
    )
    rows = (await session.execute(q)).all()

    result = []
    for r in rows:
        eff_pct = r.commission_percent if r.commission_percent is not None else _global_pct
        eff_rate = Decimal(str(eff_pct / 100))
        result.append({
            "seller_id": r.seller_id,
            "shop_name": r.shop_name or f"#{r.seller_id}",
            "address_name": r.address_name,
            "orders": r.orders,
            "revenue": round(float(r.revenue)),
            "commission": round(float(r.revenue) * float(eff_rate)),
        })

    return result
