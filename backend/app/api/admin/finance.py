"""Admin finance summary & commission settings endpoints."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from backend.app.api.deps import get_session
from backend.app.api.admin._common import require_admin_token

router = APIRouter()


# ============================================
# ФИНАНСЫ (финансовая аналитика)
# ============================================

@router.get("/finance/summary")
async def get_finance_summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    group_by: str = "day",
    session: AsyncSession = Depends(get_session),
    _token: None = Depends(require_admin_token),
):
    """Финансовая сводка с динамикой и разбивкой по продавцам."""
    from datetime import datetime as dt, time as time_t, timedelta, date as date_type
    from sqlalchemy import select, func, and_, desc, extract, literal_column
    from decimal import Decimal
    from backend.app.models.order import Order
    from backend.app.models.seller import Seller
    from backend.app.models.settings import GlobalSettings as _GS

    # Read global commission from DB
    _gs_r = await session.execute(select(_GS).order_by(_GS.id))
    _gs = _gs_r.scalar_one_or_none()
    _global_pct = _gs.commission_percent if _gs else 3
    COMMISSION = Decimal(str(_global_pct / 100))

    # Date range
    if date_from:
        d_from = dt.combine(dt.fromisoformat(date_from[:10]).date(), time_t.min)
    else:
        d_from = dt.combine(date_type.today() - timedelta(days=30), time_t.min)
    if date_to:
        d_to = dt.combine(dt.fromisoformat(date_to[:10]).date(), time_t.max)
    else:
        d_to = dt.combine(date_type.today(), time_t.max)

    completed_statuses = ["done", "completed"]
    where_current = and_(
        Order.status.in_(completed_statuses),
        Order.created_at >= d_from,
        Order.created_at <= d_to,
    )

    # Current period KPIs
    q_kpi = select(
        func.count(Order.id).label("cnt"),
        func.coalesce(func.sum(Order.total_price), 0).label("rev"),
        func.coalesce(func.avg(Order.total_price), 0).label("avg_chk"),
    ).where(where_current)
    kpi = (await session.execute(q_kpi)).one()

    revenue = float(kpi.rev)
    profit = round(revenue * float(COMMISSION))

    # Previous period (same length)
    period_len = (d_to - d_from).days or 1
    prev_from = d_from - timedelta(days=period_len)
    prev_to = d_from - timedelta(seconds=1)
    where_prev = and_(
        Order.status.in_(completed_statuses),
        Order.created_at >= prev_from,
        Order.created_at <= prev_to,
    )
    q_prev = select(
        func.count(Order.id).label("cnt"),
        func.coalesce(func.sum(Order.total_price), 0).label("rev"),
        func.coalesce(func.avg(Order.total_price), 0).label("avg_chk"),
    ).where(where_prev)
    prev = (await session.execute(q_prev)).one()

    period_data = {
        "revenue": round(revenue),
        "profit": profit,
        "orders": kpi.cnt,
        "avg_check": round(float(kpi.avg_chk)),
    }
    previous_period_data = {
        "revenue": round(float(prev.rev)),
        "profit": round(float(prev.rev) * float(COMMISSION)),
        "orders": prev.cnt,
        "avg_check": round(float(prev.avg_chk)),
    }

    # Time series
    if group_by == "week":
        grp = func.date_trunc('week', Order.created_at)
    elif group_by == "month":
        grp = func.date_trunc('month', Order.created_at)
    else:
        grp = func.date(Order.created_at)

    q_series = (
        select(
            grp.label("period"),
            func.count(Order.id).label("orders"),
            func.coalesce(func.sum(Order.total_price), 0).label("revenue"),
        )
        .where(where_current)
        .group_by(literal_column("period"))
        .order_by(literal_column("period"))
    )
    series_rows = (await session.execute(q_series)).all()

    if group_by == "day":
        # Pad missing days with zeros (consistent with get_platform_daily_stats)
        daily_map = {}
        for r in series_rows:
            day_val = r.period
            if isinstance(day_val, str):
                day_val = dt.fromisoformat(day_val[:10]).date()
            elif hasattr(day_val, 'date') and callable(day_val.date):
                day_val = day_val.date()
            daily_map[day_val] = {"orders": r.orders, "revenue": round(float(r.revenue))}

        series = []
        current_day = d_from.date()
        end_day = d_to.date()
        while current_day <= end_day:
            point = daily_map.get(current_day, {"orders": 0, "revenue": 0})
            series.append({
                "period": current_day.isoformat(),
                "orders": point["orders"],
                "revenue": point["revenue"],
            })
            current_day += timedelta(days=1)
    else:
        # Week/month grouping — no day-level padding needed
        series = [
            {"period": str(r.period), "orders": r.orders, "revenue": round(float(r.revenue))}
            for r in series_rows
        ]

    # By seller (grouped by owner_id so branches are aggregated)
    from sqlalchemy.orm import aliased
    OwnerSeller = aliased(Seller)
    q_sellers = (
        select(
            Seller.owner_id.label("owner_id"),
            OwnerSeller.shop_name,
            OwnerSeller.subscription_plan,
            OwnerSeller.commission_percent,
            func.count(Order.id).label("orders"),
            func.coalesce(func.sum(Order.total_price), 0).label("revenue"),
        )
        .join(Order, Order.seller_id == Seller.seller_id)
        .join(OwnerSeller, OwnerSeller.seller_id == Seller.owner_id)
        .where(where_current)
        .group_by(Seller.owner_id, OwnerSeller.shop_name, OwnerSeller.subscription_plan, OwnerSeller.commission_percent)
        .order_by(desc("revenue"))
    )
    seller_rows = (await session.execute(q_sellers)).all()

    total_rev = revenue or 1
    sellers = []
    for r in seller_rows:
        # Per-seller commission override > global
        eff_pct = r.commission_percent if r.commission_percent is not None else _global_pct
        eff_rate = Decimal(str(eff_pct / 100))
        sellers.append({
            "seller_id": r.owner_id,
            "shop_name": r.shop_name or f"#{r.owner_id}",
            "plan": r.subscription_plan or "free",
            "orders": r.orders,
            "revenue": round(float(r.revenue)),
            "commission": round(float(r.revenue) * float(eff_rate)),
            "commission_rate": eff_pct,
            "share_pct": round(float(r.revenue) / total_rev * 100, 1),
        })

    return {
        "period": period_data,
        "previous_period": previous_period_data,
        "series": series,
        "by_seller": sellers,
        "global_commission_rate": _global_pct,
        "date_from": d_from.date().isoformat(),
        "date_to": d_to.date().isoformat(),
    }


# ── Commission settings ──────────────────────────────────────────────

@router.get("/settings/commission")
async def get_global_commission(
    session: AsyncSession = Depends(get_session),
    _token: None = Depends(require_admin_token),
):
    """Текущий глобальный процент комиссии платформы."""
    from sqlalchemy import select as sa_select
    from backend.app.models.settings import GlobalSettings
    result = await session.execute(
        sa_select(GlobalSettings).order_by(GlobalSettings.id)
    )
    gs = result.scalar_one_or_none()
    return {"commission_percent": gs.commission_percent if gs else 3}


class CommissionUpdateRequest(BaseModel):
    commission_percent: int

    @field_validator("commission_percent")
    @classmethod
    def validate_range(cls, v: int) -> int:
        if v < 0 or v > 100:
            raise ValueError("commission_percent must be between 0 and 100")
        return v


@router.put("/settings/commission")
async def update_global_commission(
    data: CommissionUpdateRequest,
    session: AsyncSession = Depends(get_session),
    _token: None = Depends(require_admin_token),
):
    """Обновить глобальный процент комиссии платформы."""
    from backend.app.models.settings import GlobalSettings
    from sqlalchemy import select as sa_select
    result = await session.execute(sa_select(GlobalSettings).order_by(GlobalSettings.id))
    gs = result.scalar_one_or_none()
    if gs:
        gs.commission_percent = data.commission_percent
    else:
        session.add(GlobalSettings(id=1, commission_percent=data.commission_percent))
    await session.commit()
    return {"status": "ok", "commission_percent": data.commission_percent}
