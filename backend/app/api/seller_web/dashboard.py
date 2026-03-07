"""Seller web panel — Dashboard alerts, order events, upcoming events."""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.seller_web._common import (
    require_seller_token,
    get_session,
)
from backend.app.services.bouquets import list_bouquets_with_totals
from backend.app.services.loyalty import LoyaltyService
from backend.app.services.receptions import get_expiring_items

router = APIRouter()


@router.get("/dashboard/alerts")
async def get_dashboard_alerts(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Low stock bouquets (can_assemble_count <= 2) and expiring reception items (days_left <= 2)."""
    bouquets = await list_bouquets_with_totals(session, seller_id)
    low_stock_bouquets = [
        {"id": b["id"], "name": b["name"], "can_assemble_count": b.get("can_assemble_count", 0)}
        for b in bouquets
        if b.get("can_assemble_count", 0) <= 2
    ]
    expiring_items = await get_expiring_items(session, seller_id, days_left_max=2)
    return {"low_stock_bouquets": low_stock_bouquets, "expiring_items": expiring_items}


@router.get("/dashboard/order-events")
async def get_dashboard_order_events(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Order events for seller dashboard: cancelled, payment_failed, preorder_due, completed (last 48h)."""
    from backend.app.models.order import Order
    from backend.app.models.user import User
    from sqlalchemy import and_, select

    now = datetime.now()
    cutoff_48h = now - timedelta(hours=48)
    today_date = date.today()
    tomorrow_date = today_date + timedelta(days=1)

    events: list[dict] = []

    # 1) Cancelled orders (last 48h)
    q_cancelled = (
        select(Order.id, Order.total_price, Order.created_at, Order.buyer_id, Order.guest_name,
               User.fio)
        .outerjoin(User, User.tg_id == Order.buyer_id)
        .where(and_(
            Order.seller_id == seller_id,
            Order.status == "cancelled",
            Order.created_at >= cutoff_48h,
        ))
        .order_by(Order.created_at.desc())
        .limit(10)
    )
    for r in (await session.execute(q_cancelled)).all():
        buyer_name = r[4] or r[5] or ""  # prefer checkout-time name over current User.fio
        events.append({
            "type": "cancelled",
            "order_id": r[0],
            "amount": round(float(r[1] or 0)),
            "buyer_name": buyer_name,
            "created_at": r[2].isoformat() if r[2] else None,
        })

    # 2) Payment failed (accepted/assembling orders with failed payment)
    q_payment = (
        select(Order.id, Order.total_price, Order.created_at, Order.buyer_id, Order.guest_name,
               Order.payment_status, User.fio)
        .outerjoin(User, User.tg_id == Order.buyer_id)
        .where(and_(
            Order.seller_id == seller_id,
            Order.status.in_(["accepted", "assembling"]),
            Order.payment_status.in_(["canceled", "expired", "failed"]),
            Order.created_at >= cutoff_48h,
        ))
        .order_by(Order.created_at.desc())
        .limit(10)
    )
    for r in (await session.execute(q_payment)).all():
        buyer_name = r[4] or r[6] or ""  # prefer checkout-time name over current User.fio
        mins_since = int((now - r[2]).total_seconds() / 60) if r[2] else 0
        events.append({
            "type": "payment_failed",
            "order_id": r[0],
            "amount": round(float(r[1] or 0)),
            "buyer_name": buyer_name,
            "payment_status": r[5],
            "minutes_since_accepted": mins_since,
            "created_at": r[2].isoformat() if r[2] else None,
        })

    # 3) Preorder due (today/tomorrow)
    q_preorder = (
        select(Order.id, Order.total_price, Order.preorder_delivery_date, Order.buyer_id,
               Order.guest_name, User.fio)
        .outerjoin(User, User.tg_id == Order.buyer_id)
        .where(and_(
            Order.seller_id == seller_id,
            Order.is_preorder == True,
            Order.status.in_(["pending", "accepted", "assembling"]),
            Order.preorder_delivery_date.in_([today_date, tomorrow_date]),
        ))
        .order_by(Order.preorder_delivery_date)
        .limit(10)
    )
    for r in (await session.execute(q_preorder)).all():
        buyer_name = r[4] or r[5] or ""  # prefer checkout-time name over current User.fio
        delivery_date = r[2]
        events.append({
            "type": "preorder_due",
            "order_id": r[0],
            "amount": round(float(r[1] or 0)),
            "buyer_name": buyer_name,
            "delivery_date": delivery_date.isoformat() if delivery_date else None,
            "is_today": delivery_date == today_date if delivery_date else False,
        })

    # 4) Completed orders (last 48h)
    q_completed = (
        select(Order.id, Order.total_price, Order.completed_at, Order.buyer_id, Order.guest_name,
               User.fio)
        .outerjoin(User, User.tg_id == Order.buyer_id)
        .where(and_(
            Order.seller_id == seller_id,
            Order.status == "completed",
            Order.completed_at >= cutoff_48h,
        ))
        .order_by(Order.completed_at.desc())
        .limit(10)
    )
    for r in (await session.execute(q_completed)).all():
        buyer_name = r[4] or r[5] or ""  # prefer checkout-time name over current User.fio
        events.append({
            "type": "completed",
            "order_id": r[0],
            "amount": round(float(r[1] or 0)),
            "buyer_name": buyer_name,
            "completed_at": r[2].isoformat() if r[2] else None,
        })

    # Sort: cancelled/payment_failed first, then preorder_due, then completed
    type_priority = {"cancelled": 0, "payment_failed": 1, "preorder_due": 2, "completed": 3}
    events.sort(key=lambda e: type_priority.get(e["type"], 99))

    return {"events": events}


@router.get("/dashboard/upcoming-events")
async def get_upcoming_events(
    days: int = Query(default=7, ge=1, le=90),
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    svc = LoyaltyService(session)
    return await svc.get_upcoming_events(seller_id, days_ahead=days)
