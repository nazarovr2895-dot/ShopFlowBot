"""Loyalty, customers, subscribers, and customer events."""
import csv
import io
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.seller_web._common import (
    logger,
    get_session,
    require_seller_token,
    require_seller_token_with_owner,
    resolve_branch_target,
    Seller,
)
from backend.app.services.loyalty import (
    LoyaltyService,
    LoyaltyServiceError,
    CustomerNotFoundError,
    DuplicatePhoneError,
)
from backend.app.services.orders import OrderService

router = APIRouter()

# Alias to match original code style
_resolve_branch_target = resolve_branch_target


# --- LOYALTY / CUSTOMERS ---
class LoyaltySettingsBody(BaseModel):
    points_percent: float
    max_points_discount_percent: Optional[int] = None
    points_to_ruble_rate: Optional[float] = None
    tiers_config: Optional[List[dict]] = None
    points_expire_days: Optional[int] = None


class CreateCustomerBody(BaseModel):
    phone: str
    first_name: str
    last_name: str
    birthday: Optional[str] = None


class RecordSaleBody(BaseModel):
    amount: float


class DeductPointsBody(BaseModel):
    points: float


class UpdateCustomerBody(BaseModel):
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    birthday: Optional[str] = "__unset__"


@router.get("/loyalty/settings")
async def get_loyalty_settings(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from backend.app.models.seller import Seller
    seller = await session.get(Seller, seller_id)
    return {
        "points_percent": float(seller.loyalty_points_percent or 0) if seller else 0,
        "max_points_discount_percent": seller.max_points_discount_percent if seller else 100,
        "points_to_ruble_rate": float(seller.points_to_ruble_rate or 1) if seller else 1,
        "tiers_config": seller.loyalty_tiers_config if seller else None,
        "points_expire_days": seller.points_expire_days if seller else None,
    }


@router.put("/loyalty/settings")
async def update_loyalty_settings(
    body: LoyaltySettingsBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from decimal import Decimal
    from backend.app.models.seller import Seller
    seller = await session.get(Seller, seller_id)
    if not seller:
        raise HTTPException(status_code=404, detail="Продавец не найден")
    seller.loyalty_points_percent = Decimal(str(body.points_percent))
    if body.max_points_discount_percent is not None:
        seller.max_points_discount_percent = body.max_points_discount_percent
    if body.points_to_ruble_rate is not None:
        seller.points_to_ruble_rate = Decimal(str(body.points_to_ruble_rate))
    if body.tiers_config is not None:
        seller.loyalty_tiers_config = body.tiers_config if body.tiers_config else None
    if body.points_expire_days is not None:
        seller.points_expire_days = body.points_expire_days if body.points_expire_days > 0 else None
    await session.commit()
    return {
        "points_percent": float(seller.loyalty_points_percent),
        "max_points_discount_percent": seller.max_points_discount_percent,
        "points_to_ruble_rate": float(seller.points_to_ruble_rate or 1),
        "tiers_config": seller.loyalty_tiers_config,
        "points_expire_days": seller.points_expire_days,
    }


@router.get("/customers/tags")
async def get_customer_tags(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Get all unique tags used by seller's customers (for autocomplete)."""
    svc = LoyaltyService(session)
    return await svc.get_all_tags(seller_id)


@router.get("/customers/segments")
async def get_customer_segments(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Get RFM segments summary for all customers."""
    from backend.app.services.loyalty import get_customer_segments as _get_segments
    return await _get_segments(session, seller_id)


@router.get("/loyalty/expiring")
async def get_expiring_points(
    days: int = 30,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Get customers with points expiring within N days."""
    from backend.app.services.loyalty import get_expiring_points as _get_expiring
    return await _get_expiring(session, seller_id, days)


@router.get("/customers")
async def list_customers(
    tag: Optional[str] = None,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    svc = LoyaltyService(session)
    return await svc.list_customers(seller_id, tag_filter=tag)


@router.post("/customers")
async def create_customer(
    body: CreateCustomerBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    svc = LoyaltyService(session)
    try:
        birthday = date.fromisoformat(body.birthday) if body.birthday else None
        customer = await svc.create_customer(
            seller_id,
            body.phone,
            body.first_name,
            body.last_name,
            birthday=birthday,
        )
        await session.commit()
        return customer
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный формат даты рождения")
    except (DuplicatePhoneError, LoyaltyServiceError) as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/customers/export")
async def export_customers_csv(
    branch: Optional[str] = Query(None, description="'all' for all branches or seller_id"),
    auth: tuple = Depends(require_seller_token_with_owner),
    session: AsyncSession = Depends(get_session),
):
    """Export customers to CSV file."""
    seller_id, owner_id = auth
    svc = LoyaltyService(session)
    target = await _resolve_branch_target(branch, seller_id, owner_id, session)

    is_multi = isinstance(target, list)
    name_map = {}
    if is_multi:
        branch_rows = await session.execute(
            select(Seller.seller_id, Seller.shop_name, Seller.address_name).where(
                Seller.seller_id.in_(target)
            )
        )
        name_map = {
            r.seller_id: f"{r.shop_name}" + (f" ({r.address_name})" if r.address_name else "")
            for r in branch_rows.all()
        }
        all_customers = []
        for sid in target:
            custs = await svc.list_customers(sid)
            for c in custs:
                c["branch_name"] = name_map.get(sid, str(sid))
            all_customers.extend(custs)
        customers = all_customers
    else:
        customers = await svc.list_customers(target)

    # Create CSV in memory (utf-8-sig encoding adds BOM for Excel compatibility)
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')

    # Headers
    headers = ['Телефон', 'Имя', 'Фамилия', 'Карта', 'Баллы', 'Дата регистрации', 'Заметка', 'Теги']
    if is_multi:
        headers.append('Филиал')
    writer.writerow(headers)

    # Rows
    for c in customers:
        row = [
            c.get('phone', ''),
            c.get('first_name', ''),
            c.get('last_name', ''),
            c.get('card_number', ''),
            c.get('points_balance', 0),
            c.get('created_at', ''),
            c.get('notes', ''),
            ', '.join(c.get('tags') or []) if isinstance(c.get('tags'), list) else (c.get('tags') or ''),
        ]
        if is_multi:
            row.append(c.get('branch_name', ''))
        writer.writerow(row)

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),
        media_type='text/csv; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename="customers_{datetime.now().strftime("%Y%m%d")}.csv"'}
    )


@router.get("/customers/all")
async def list_all_customers(
    branch: Optional[str] = Query(None, description="'all' for all branches or seller_id"),
    auth: tuple = Depends(require_seller_token_with_owner),
    session: AsyncSession = Depends(get_session),
):
    """Unified list: all subscribers + standalone loyalty customers.
    Used by the Customers page to show the full client base with search support.
    Supports branch param for network owners to aggregate across branches.
    """
    seller_id, owner_id = auth
    from backend.app.services.cart import FavoriteSellersService
    svc = FavoriteSellersService(session)
    target = await _resolve_branch_target(branch, seller_id, owner_id, session)
    if isinstance(target, list):
        # Build branch name lookup
        branch_rows = await session.execute(
            select(Seller.seller_id, Seller.shop_name, Seller.address_name).where(
                Seller.seller_id.in_(target)
            )
        )
        name_map = {
            r.seller_id: f"{r.shop_name}" + (f" ({r.address_name})" if r.address_name else "")
            for r in branch_rows.all()
        }
        all_customers = []
        for sid in target:
            customers = await svc.get_subscribers_with_customers(sid)
            bname = name_map.get(sid, str(sid))
            for c in customers:
                c["branch_seller_id"] = sid
                c["branch_name"] = bname
            all_customers.extend(customers)
        return all_customers
    return await svc.get_subscribers_with_customers(target)


@router.get("/customers/{customer_id}")
async def get_customer(
    customer_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    svc = LoyaltyService(session)
    data = await svc.get_customer(customer_id, seller_id)
    if not data:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    order_svc = OrderService(session)
    orders = await order_svc.get_seller_orders_by_buyer_phone(seller_id, data.get("phone") or "")
    completed = [o for o in orders if o.get("status") in ("done", "completed")]
    total_purchases = sum(float(o.get("total_price") or 0) for o in completed)
    last_order_at = None
    if completed:
        dates = [o.get("created_at") for o in completed if o.get("created_at")]
        if dates:
            last_order_at = max(dates)
    data["total_purchases"] = round(total_purchases, 2)
    data["last_order_at"] = last_order_at
    data["completed_orders_count"] = len(completed)
    # Compute loyalty tier
    from backend.app.services.loyalty import compute_tier
    from backend.app.models.seller import Seller
    seller = await session.get(Seller, seller_id)
    tiers_config = getattr(seller, 'loyalty_tiers_config', None) if seller else None
    data["tier"] = compute_tier(total_purchases, tiers_config)
    return data


@router.get("/customers/{customer_id}/orders")
async def get_customer_orders(
    customer_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    svc = LoyaltyService(session)
    customer = await svc.get_customer(customer_id, seller_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    order_svc = OrderService(session)
    return await order_svc.get_seller_orders_by_buyer_phone(seller_id, customer.get("phone") or "")


@router.patch("/customers/{customer_id}")
async def update_customer(
    customer_id: int,
    body: UpdateCustomerBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    svc = LoyaltyService(session)
    result = await svc.update_customer(
        seller_id, customer_id,
        notes=body.notes, tags=body.tags, birthday=body.birthday,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    await session.commit()
    return result


@router.post("/customers/{customer_id}/sales")
async def record_customer_sale(
    customer_id: int,
    body: RecordSaleBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма должна быть больше 0")
    svc = LoyaltyService(session)
    try:
        result = await svc.accrue_points(seller_id, customer_id, body.amount, order_id=None)
        await session.commit()
        return result
    except CustomerNotFoundError as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/customers/{customer_id}/deduct")
async def deduct_customer_points(
    customer_id: int,
    body: DeductPointsBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    if body.points <= 0:
        raise HTTPException(status_code=400, detail="Укажите положительное количество баллов")
    svc = LoyaltyService(session)
    try:
        result = await svc.deduct_points(seller_id, customer_id, body.points)
        await session.commit()
        return result
    except (CustomerNotFoundError, LoyaltyServiceError) as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)


# --- SUBSCRIBERS ---
@router.get("/subscribers")
async def get_subscribers(
    branch: Optional[str] = Query(None, description="'all' for all branches or seller_id"),
    auth: tuple = Depends(require_seller_token_with_owner),
    session: AsyncSession = Depends(get_session),
):
    """Get all subscribers for the current seller with loyalty status.
    Supports branch param for network owners to aggregate across branches.
    """
    seller_id, owner_id = auth
    from backend.app.services.cart import FavoriteSellersService
    svc = FavoriteSellersService(session)
    target = await _resolve_branch_target(branch, seller_id, owner_id, session)
    if isinstance(target, list):
        branch_rows = await session.execute(
            select(Seller.seller_id, Seller.shop_name, Seller.address_name).where(
                Seller.seller_id.in_(target)
            )
        )
        name_map = {
            r.seller_id: f"{r.shop_name}" + (f" ({r.address_name})" if r.address_name else "")
            for r in branch_rows.all()
        }
        all_subscribers = []
        total = 0
        for sid in target:
            subs = await svc.get_subscribers(sid)
            bname = name_map.get(sid, str(sid))
            for s in subs:
                s["branch_seller_id"] = sid
                s["branch_name"] = bname
            all_subscribers.extend(subs)
            total += await svc.get_subscriber_count(sid)
        return {"subscribers": all_subscribers, "total": total}
    subscribers = await svc.get_subscribers(target)
    count = await svc.get_subscriber_count(target)
    return {"subscribers": subscribers, "total": count}


@router.get("/subscribers/count")
async def get_subscriber_count(
    branch: Optional[str] = Query(None, description="'all' for aggregated or seller_id"),
    auth: tuple = Depends(require_seller_token_with_owner),
    session: AsyncSession = Depends(get_session),
):
    """Get subscriber count for the current seller or aggregated across branches."""
    seller_id, owner_id = auth
    from backend.app.services.cart import FavoriteSellersService
    svc = FavoriteSellersService(session)
    target = await _resolve_branch_target(branch, seller_id, owner_id, session)
    if isinstance(target, list):
        total = 0
        for sid in target:
            total += await svc.get_subscriber_count(sid)
        return {"count": total}
    count = await svc.get_subscriber_count(target)
    return {"count": count}


# --- CUSTOMER EVENTS ---
class CreateEventBody(BaseModel):
    title: str
    event_date: str
    remind_days_before: int = 3
    notes: Optional[str] = None


class UpdateEventBody(BaseModel):
    title: Optional[str] = None
    event_date: Optional[str] = None
    remind_days_before: Optional[int] = None
    notes: Optional[str] = "__unset__"


@router.post("/customers/{customer_id}/events")
async def create_customer_event(
    customer_id: int,
    body: CreateEventBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    svc = LoyaltyService(session)
    try:
        event_date = date.fromisoformat(body.event_date)
        result = await svc.add_event(
            seller_id, customer_id,
            title=body.title,
            event_date=event_date,
            remind_days_before=body.remind_days_before,
            notes=body.notes,
        )
        await session.commit()
        return result
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный формат даты")
    except CustomerNotFoundError as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/customers/{customer_id}/events/{event_id}")
async def update_customer_event(
    customer_id: int,
    event_id: int,
    body: UpdateEventBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    svc = LoyaltyService(session)
    try:
        event_date = date.fromisoformat(body.event_date) if body.event_date else None
        result = await svc.update_event(
            seller_id, event_id,
            title=body.title,
            event_date=event_date,
            remind_days_before=body.remind_days_before,
            notes=body.notes,
        )
        if not result:
            raise HTTPException(status_code=404, detail="Событие не найдено")
        await session.commit()
        return result
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный формат даты")


@router.delete("/customers/{customer_id}/events/{event_id}")
async def delete_customer_event(
    customer_id: int,
    event_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    svc = LoyaltyService(session)
    ok = await svc.delete_event(seller_id, event_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    await session.commit()
    return {"ok": True}
