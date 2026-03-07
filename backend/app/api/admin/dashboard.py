"""Admin dashboard endpoint — aggregated data for the main page."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_session
from backend.app.api.admin._common import require_admin_token

router = APIRouter()


# ============================================
# DASHBOARD  (агрегированные данные для главной)
# ============================================

@router.get("/dashboard")
async def get_admin_dashboard(session: AsyncSession = Depends(get_session), _token: None = Depends(require_admin_token)):
    """Агрегированные данные для главной страницы админ-панели."""
    from datetime import datetime as dt, time, timedelta, date as date_type
    from sqlalchemy import select, func, case, and_, or_, literal_column
    from decimal import Decimal
    from backend.app.models.order import Order
    from backend.app.models.seller import Seller
    from backend.app.models.user import User

    today_start = dt.combine(date_type.today(), time.min)
    yesterday_start = today_start - timedelta(days=1)
    week_ago = today_start - timedelta(days=7)
    # Read commission rate from DB (per-seller not applicable here — aggregate)
    from backend.app.models.settings import GlobalSettings as _GS
    _gs_r = await session.execute(select(_GS).order_by(_GS.id))
    _gs = _gs_r.scalar_one_or_none()
    COMMISSION = Decimal(str((_gs.commission_percent if _gs else 3) / 100))

    # ── today vs yesterday ──
    # Only count completed orders as revenue (not pending/rejected/cancelled)
    completed_statuses = ["done", "completed"]

    # All orders today (for order count — useful to see total activity)
    q_today_all = select(
        func.count(Order.id).label("cnt"),
    ).where(Order.created_at >= today_start)
    q_yest_all = select(
        func.count(Order.id).label("cnt"),
    ).where(and_(Order.created_at >= yesterday_start, Order.created_at < today_start))

    # Completed orders only (for revenue, profit, avg check)
    q_today_completed = select(
        func.coalesce(func.sum(Order.total_price), 0).label("rev"),
        func.coalesce(func.avg(Order.total_price), 0).label("avg_chk"),
    ).where(and_(Order.created_at >= today_start, Order.status.in_(completed_statuses)))
    q_yest_completed = select(
        func.coalesce(func.sum(Order.total_price), 0).label("rev"),
        func.coalesce(func.avg(Order.total_price), 0).label("avg_chk"),
    ).where(and_(Order.created_at >= yesterday_start, Order.created_at < today_start, Order.status.in_(completed_statuses)))

    q_new_cust_today = select(func.count(User.tg_id)).where(
        and_(User.created_at >= today_start, User.role == "BUYER")
    )
    q_new_cust_yest = select(func.count(User.tg_id)).where(
        and_(User.created_at >= yesterday_start, User.created_at < today_start, User.role == "BUYER")
    )

    r_today_all = (await session.execute(q_today_all)).one()
    r_yest_all = (await session.execute(q_yest_all)).one()
    r_today_completed = (await session.execute(q_today_completed)).one()
    r_yest_completed = (await session.execute(q_yest_completed)).one()
    new_today = (await session.execute(q_new_cust_today)).scalar() or 0
    new_yest = (await session.execute(q_new_cust_yest)).scalar() or 0

    rev_today = float(r_today_completed.rev)
    rev_yest = float(r_yest_completed.rev)

    today_data = {
        "orders": r_today_all.cnt,
        "orders_yesterday": r_yest_all.cnt,
        "revenue": round(rev_today),
        "revenue_yesterday": round(rev_yest),
        "profit": round(rev_today * float(COMMISSION)),
        "profit_yesterday": round(rev_yest * float(COMMISSION)),
        "avg_check": round(float(r_today_completed.avg_chk)),
        "avg_check_yesterday": round(float(r_yest_completed.avg_chk)),
        "new_customers": new_today,
        "new_customers_yesterday": new_yest,
    }

    # ── pipeline ──
    pipe_statuses = {
        "pending": ["pending"],
        "in_progress": ["accepted", "assembling"],
        "in_transit": ["in_transit", "ready_for_pickup"],
    }
    pipeline = {}
    for key, statuses in pipe_statuses.items():
        q = select(
            func.count(Order.id), func.coalesce(func.sum(Order.total_price), 0)
        ).where(Order.status.in_(statuses))
        row = (await session.execute(q)).one()
        pipeline[key] = {"count": row[0], "amount": round(float(row[1]))}

    for label, status_list in [("completed_today", ["done", "completed"]), ("rejected_today", ["rejected", "cancelled"])]:
        q = select(
            func.count(Order.id), func.coalesce(func.sum(Order.total_price), 0)
        ).where(and_(Order.status.in_(status_list), Order.created_at >= today_start))
        row = (await session.execute(q)).one()
        pipeline[label] = {"count": row[0], "amount": round(float(row[1]))}

    # ── alerts ──
    # expiring placements (< 7 days)
    seven_days = dt.now() + timedelta(days=7)
    q_exp = select(Seller.seller_id, Seller.shop_name, Seller.placement_expired_at).where(
        and_(
            Seller.placement_expired_at.isnot(None),
            Seller.placement_expired_at <= seven_days,
            Seller.placement_expired_at > dt.now(),
            Seller.deleted_at.is_(None),
        )
    )
    exp_rows = (await session.execute(q_exp)).all()
    expiring = [
        {"tg_id": r[0], "shop_name": r[1] or "", "expires_in_days": max(0, (r[2] - dt.now()).days)}
        for r in exp_rows
    ]

    # exhausted limits
    q_exh = select(Seller.seller_id, Seller.shop_name, Seller.active_orders, Seller.max_orders).where(
        and_(
            Seller.max_orders > 0,
            Seller.active_orders >= Seller.max_orders,
            Seller.deleted_at.is_(None),
            Seller.is_blocked == False,
        )
    )
    exh_rows = (await session.execute(q_exh)).all()
    exhausted = [
        {"tg_id": r[0], "shop_name": r[1] or "", "used": r[2] or 0, "limit": r[3] or 0}
        for r in exh_rows
    ]

    # stuck orders (pending > 30 min)
    thirty_min_ago = dt.now() - timedelta(minutes=30)
    q_stuck = (
        select(Order.id, Order.total_price, Order.created_at, Seller.shop_name, Order.seller_id)
        .join(Seller, Seller.seller_id == Order.seller_id)
        .where(and_(Order.status == "pending", Order.created_at < thirty_min_ago))
        .order_by(Order.created_at)
        .limit(10)
    )
    stuck_rows = (await session.execute(q_stuck)).all()
    stuck = [
        {
            "order_id": r[0],
            "seller_id": r[4],
            "seller_name": r[3] or "",
            "minutes_pending": int((dt.now() - r[2]).total_seconds() / 60),
            "amount": round(float(r[1] or 0)),
        }
        for r in stuck_rows
    ]

    # ── weekly revenue (completed orders only) ──
    q_weekly = (
        select(
            func.date(Order.created_at).label("d"),
            func.count(Order.id).label("orders"),
            func.coalesce(func.sum(Order.total_price), 0).label("revenue"),
        )
        .where(and_(Order.created_at >= week_ago, Order.status.in_(completed_statuses)))
        .group_by(func.date(Order.created_at))
        .order_by(literal_column("d"))
    )
    weekly_rows = (await session.execute(q_weekly)).all()
    weekly_revenue = [
        {"date": str(r.d), "revenue": round(float(r.revenue)), "orders": r.orders}
        for r in weekly_rows
    ]

    # ── top sellers today (completed orders only) ──
    q_top = (
        select(
            Seller.seller_id,
            Seller.shop_name,
            func.count(Order.id).label("orders"),
            func.coalesce(func.sum(Order.total_price), 0).label("revenue"),
            Seller.max_orders,
            Seller.active_orders,
        )
        .join(Order, Order.seller_id == Seller.seller_id)
        .where(and_(Order.created_at >= today_start, Order.status.in_(completed_statuses)))
        .group_by(Seller.seller_id, Seller.shop_name, Seller.max_orders, Seller.active_orders)
        .order_by(func.count(Order.id).desc())
        .limit(5)
    )
    top_rows = (await session.execute(q_top)).all()
    top_sellers = [
        {
            "tg_id": r.seller_id,
            "shop_name": r.shop_name or "",
            "orders": r.orders,
            "revenue": round(float(r.revenue)),
            "load_pct": round((r.active_orders or 0) / r.max_orders * 100) if r.max_orders else 0,
        }
        for r in top_rows
    ]

    # ── totals ──
    total_sellers = (await session.execute(
        select(func.count(Seller.seller_id)).where(Seller.deleted_at.is_(None))
    )).scalar() or 0
    total_buyers = (await session.execute(
        select(func.count(User.tg_id)).where(User.role == "BUYER")
    )).scalar() or 0
    total_orders = (await session.execute(select(func.count(Order.id)))).scalar() or 0

    return {
        "today": today_data,
        "pipeline": pipeline,
        "alerts": {
            "expiring_placements": expiring,
            "exhausted_limits": exhausted,
            "stuck_orders": stuck,
        },
        "weekly_revenue": weekly_revenue,
        "top_sellers_today": top_sellers,
        "totals": {"sellers": total_sellers, "buyers": total_buyers, "orders": total_orders},
    }
