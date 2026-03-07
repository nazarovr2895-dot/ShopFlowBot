"""Admin customers listing endpoint."""

from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_session
from backend.app.api.admin._common import require_admin_token

router = APIRouter()


# ============================================
# ПОКУПАТЕЛИ (клиентская база)
# ============================================

@router.get("/customers")
async def get_admin_customers(
    city_id: Optional[int] = None,
    min_orders: Optional[int] = None,
    page: int = 1,
    per_page: int = 30,
    session: AsyncSession = Depends(get_session),
    _token: None = Depends(require_admin_token),
):
    """Список покупателей с агрегированной статистикой."""
    from datetime import datetime as dt, time as time_t, date as date_type
    from sqlalchemy import select, func, and_, or_, desc, case, union_all
    from sqlalchemy.orm import aliased
    from backend.app.models.order import Order
    from backend.app.models.user import User
    from backend.app.models.seller import City

    # Separate alias for User inside UNION ALL subqueries to avoid
    # SQLAlchemy mapper conflict with the outer query's User reference
    GuestUser = aliased(User, flat=True)

    today_start = dt.combine(date_type.today(), time_t.min)
    # Exclude only rejected/cancelled — accepted orders already represent real spending
    excluded_statuses = ["rejected", "cancelled"]

    # summary
    total_buyers = (await session.execute(
        select(func.count(User.tg_id)).where(User.role == "BUYER")
    )).scalar() or 0

    # active_buyers: count distinct users who placed orders (auth + guest matched by phone)
    _auth_buyer_ids = (
        select(Order.buyer_id.label("uid"))
        .where(Order.status.notin_(excluded_statuses), Order.buyer_id.isnot(None))
    )
    _guest_buyer_ids = (
        select(GuestUser.tg_id.label("uid"))
        .select_from(Order)
        .join(GuestUser, Order.guest_phone == GuestUser.phone)
        .where(
            Order.status.notin_(excluded_statuses),
            Order.buyer_id.is_(None),
            Order.guest_phone.isnot(None), Order.guest_phone != "",
            GuestUser.phone.isnot(None), GuestUser.phone != "",
        )
    )
    _all_buyer_ids = union_all(_auth_buyer_ids, _guest_buyer_ids).subquery("all_buyers")
    active_buyers = (await session.execute(
        select(func.count(func.distinct(_all_buyer_ids.c.uid)))
    )).scalar() or 0

    new_today = (await session.execute(
        select(func.count(User.tg_id)).where(and_(User.role == "BUYER", User.created_at >= today_start))
    )).scalar() or 0

    avg_ltv_r = (await session.execute(
        select(func.avg(func.coalesce(Order.total_price, 0))).where(
            Order.status.notin_(excluded_statuses)
        )
    )).scalar()
    avg_ltv = round(float(avg_ltv_r or 0))

    # city distribution
    q_city = (
        select(City.name, func.count(User.tg_id))
        .join(User, User.city_id == City.id)
        .where(User.role == "BUYER")
        .group_by(City.name)
        .order_by(func.count(User.tg_id).desc())
        .limit(10)
    )
    city_rows = (await session.execute(q_city)).all()
    city_distribution = [{"city": r[0], "count": r[1]} for r in city_rows]

    # Two separate subqueries instead of UNION ALL (avoids SQLAlchemy mapper issues)
    # Subquery 1: authenticated orders aggregated by buyer_id
    auth_stats = (
        select(
            Order.buyer_id.label("user_id"),
            func.count(Order.id).label("cnt"),
            func.coalesce(func.sum(Order.total_price), 0).label("spent"),
            func.max(Order.created_at).label("last_at"),
        )
        .where(Order.status.notin_(excluded_statuses), Order.buyer_id.isnot(None))
        .group_by(Order.buyer_id)
        .subquery("auth_stats")
    )
    # Subquery 2: guest orders aggregated by matched user (phone)
    guest_stats = (
        select(
            GuestUser.tg_id.label("user_id"),
            func.count(Order.id).label("cnt"),
            func.coalesce(func.sum(Order.total_price), 0).label("spent"),
            func.max(Order.created_at).label("last_at"),
        )
        .select_from(Order)
        .join(GuestUser, Order.guest_phone == GuestUser.phone)
        .where(
            Order.status.notin_(excluded_statuses),
            Order.buyer_id.is_(None),
            Order.guest_phone.isnot(None), Order.guest_phone != "",
            GuestUser.phone.isnot(None), GuestUser.phone != "",
        )
        .group_by(GuestUser.tg_id)
        .subquery("guest_stats")
    )

    # Combine auth + guest stats with addition (handles NULLs via COALESCE)
    orders_count_expr = (
        func.coalesce(auth_stats.c.cnt, 0) + func.coalesce(guest_stats.c.cnt, 0)
    )
    total_spent_expr = (
        func.coalesce(auth_stats.c.spent, 0) + func.coalesce(guest_stats.c.spent, 0)
    )

    q_base = (
        select(
            User.tg_id,
            User.fio,
            User.username,
            User.phone,
            User.created_at.label("registered_at"),
            City.name.label("city"),
            orders_count_expr.label("orders_count"),
            total_spent_expr.label("total_spent"),
            func.greatest(auth_stats.c.last_at, guest_stats.c.last_at).label("last_order_at"),
        )
        .outerjoin(auth_stats, auth_stats.c.user_id == User.tg_id)
        .outerjoin(guest_stats, guest_stats.c.user_id == User.tg_id)
        .outerjoin(City, City.id == User.city_id)
        .where(or_(
            User.role == "BUYER",
            auth_stats.c.user_id.isnot(None),
            guest_stats.c.user_id.isnot(None),
        ))
    )

    if city_id:
        q_base = q_base.where(User.city_id == city_id)
    if min_orders:
        q_base = q_base.where(orders_count_expr >= min_orders)

    # count for pagination
    from sqlalchemy import text
    count_q = select(func.count()).select_from(q_base.subquery())
    total_filtered = (await session.execute(count_q)).scalar() or 0
    pages = max(1, -(-total_filtered // per_page))

    offset = (page - 1) * per_page
    q_final = q_base.order_by(desc("orders_count")).offset(offset).limit(per_page)
    rows = (await session.execute(q_final)).all()

    customers = []
    for r in rows:
        customers.append({
            "tg_id": r.tg_id,
            "fio": r.fio,
            "username": r.username,
            "phone": r.phone,
            "city": r.city,
            "orders_count": r.orders_count,
            "total_spent": round(float(r.total_spent)),
            "last_order_at": r.last_order_at.isoformat() if r.last_order_at else None,
            "registered_at": r.registered_at.isoformat() if r.registered_at else None,
        })

    return {
        "customers": customers,
        "total": total_filtered,
        "pages": pages,
        "page": page,
        "summary": {
            "total_buyers": total_buyers,
            "active_buyers": active_buyers,
            "new_today": new_today,
            "avg_ltv": avg_ltv,
        },
        "city_distribution": city_distribution,
    }
