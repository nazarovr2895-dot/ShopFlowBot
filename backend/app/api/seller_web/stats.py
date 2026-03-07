"""Seller web panel — Stats: analytics/visitors, stats, export CSV, customer stats."""
import csv
import io
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.seller_web._common import (
    logger,
    require_seller_token_with_owner,
    get_session,
    resolve_branch_target,
)
from backend.app.services.orders import OrderService

router = APIRouter()


@router.get("/analytics/visitors")
async def get_seller_visitor_analytics(
    period: Optional[str] = Query(None, description="Predefined range: 7d, 30d, 90d"),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    branch: Optional[str] = Query(None, description="'all' for aggregated or seller_id"),
    auth: tuple = Depends(require_seller_token_with_owner),
    session: AsyncSession = Depends(get_session),
):
    """Visitor analytics for seller: views, unique visitors, conversion."""
    from datetime import date as date_type, timedelta
    from backend.app.services.analytics import AnalyticsService

    seller_id, owner_id = auth
    target = await resolve_branch_target(branch, seller_id, owner_id, session)

    today = date_type.today()
    d_from, d_to = today - timedelta(days=6), today
    if period:
        days_map = {"1d": 0, "7d": 6, "30d": 29, "90d": 89}
        days = days_map.get(period, 6)
        d_from = today - timedelta(days=days)
    elif date_from:
        try:
            d_from = date_type.fromisoformat(date_from)
        except ValueError:
            pass
        if date_to:
            try:
                d_to = date_type.fromisoformat(date_to)
            except ValueError:
                pass

    svc = AnalyticsService(session)
    analytics = await svc.get_seller_analytics(target, d_from, d_to)
    analytics['top_products'] = await svc.get_seller_top_products(target, d_from, d_to)
    return analytics


@router.get("/stats")
async def get_stats(
    period: Optional[str] = Query(None, description="Predefined range: 1d, 7d, 30d"),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    branch: Optional[str] = Query(None, description="'all' for aggregated or seller_id"),
    auth: tuple = Depends(require_seller_token_with_owner),
    session: AsyncSession = Depends(get_session),
):
    """Get order stats for current seller or aggregated across branches."""
    seller_id, owner_id = auth
    target = await resolve_branch_target(branch, seller_id, owner_id, session)

    def _parse_date(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            return None

    start_date = _parse_date(date_from)
    end_date = _parse_date(date_to)
    applied_period: Optional[str] = None

    if start_date and not end_date:
        end_date = start_date
    elif end_date and not start_date:
        start_date = end_date
    if start_date and end_date and start_date > end_date:
        start_date, end_date = end_date, start_date

    period_key = (period or "").lower()
    if not start_date and not end_date and period_key in {"1d", "7d", "30d"}:
        # Use Moscow timezone for day boundaries
        MSK = ZoneInfo("Europe/Moscow")
        today_msk = datetime.now(MSK).date()
        if period_key == "1d":
            start_day_msk = today_msk
        elif period_key == "7d":
            start_day_msk = today_msk - timedelta(days=6)
        else:
            start_day_msk = today_msk - timedelta(days=29)
        # Create datetime boundaries in MSK (00:00:00 to 23:59:59)
        start_datetime_msk = datetime.combine(start_day_msk, datetime.min.time()).replace(tzinfo=MSK)
        end_datetime_msk = datetime.combine(today_msk, datetime.max.time()).replace(tzinfo=MSK)
        # Convert to UTC for database queries (DB stores UTC timestamps)
        start_date = start_datetime_msk.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        end_date = end_datetime_msk.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        applied_period = period_key
    elif start_date or end_date:
        applied_period = "custom"

    service = OrderService(session)
    stats = await service.get_seller_stats(
        target,
        date_from=start_date,
        date_to=end_date,
    )
    stats.setdefault("filters", {})
    stats["filters"]["period"] = applied_period
    return stats


@router.get("/stats/export")
async def export_stats_csv(
    period: Optional[str] = Query(None, description="Predefined range: 1d, 7d, 30d"),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    branch: Optional[str] = Query(None, description="'all' for aggregated or seller_id"),
    auth: tuple = Depends(require_seller_token_with_owner),
    session: AsyncSession = Depends(get_session),
):
    """Export statistics to CSV file."""
    seller_id, owner_id = auth
    target = await resolve_branch_target(branch, seller_id, owner_id, session)

    def _parse_date(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            return None

    start_date = _parse_date(date_from)
    end_date = _parse_date(date_to)

    if start_date and not end_date:
        end_date = start_date
    elif end_date and not start_date:
        start_date = end_date
    if start_date and end_date and start_date > end_date:
        start_date, end_date = end_date, start_date

    period_key = (period or "").lower()
    if not start_date and not end_date and period_key in {"1d", "7d", "30d"}:
        # Use Moscow timezone for day boundaries
        MSK = ZoneInfo("Europe/Moscow")
        today_msk = datetime.now(MSK).date()
        if period_key == "1d":
            start_day_msk = today_msk
        elif period_key == "7d":
            start_day_msk = today_msk - timedelta(days=6)
        else:
            start_day_msk = today_msk - timedelta(days=29)
        start_datetime_msk = datetime.combine(start_day_msk, datetime.min.time()).replace(tzinfo=MSK)
        end_datetime_msk = datetime.combine(today_msk, datetime.max.time()).replace(tzinfo=MSK)
        start_date = start_datetime_msk.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        end_date = end_datetime_msk.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

    # Get stats
    service = OrderService(session)
    stats = await service.get_seller_stats(target, date_from=start_date, date_to=end_date)

    # Build CSV
    output = io.StringIO()
    output.write('\ufeff')  # BOM for Excel
    writer = csv.writer(output, delimiter=';')

    # Headers
    writer.writerow(['Дата', 'Заказов', 'Выручка (₽)'])

    # Daily breakdown
    for day_stat in stats.get('daily_sales', []):
        writer.writerow([
            day_stat.get('date', ''),
            day_stat.get('orders', 0),
            f"{day_stat.get('revenue', 0):.2f}",
        ])

    # Total row
    writer.writerow([])
    writer.writerow(['ИТОГО', '', ''])
    total_revenue = stats.get('total_revenue', 0)
    total_orders = stats.get('total_completed_orders', 0)
    commission_pct = stats.get('commission_rate', 3)
    commission = round(total_revenue * commission_pct / 100, 2)
    net_amount = round(total_revenue - commission, 2)

    writer.writerow(['Заказов всего', total_orders, ''])
    writer.writerow(['Выручка всего', '', f"{total_revenue:.2f}"])
    writer.writerow([f'Комиссия Flurai ({commission_pct}%)', '', f"{commission:.2f}"])
    writer.writerow(['Комиссия платёжной системы (~3.5%)', '', 'Удерживается ЮKassa'])
    writer.writerow(['К получению', '', f"{net_amount:.2f}"])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),
        media_type='text/csv; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename="stats_{datetime.now().strftime("%Y%m%d")}.csv"'}
    )


@router.get("/stats/customers")
async def get_customer_stats(
    period: Optional[str] = Query(None, description="Predefined range: 1d, 7d, 30d"),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    branch: Optional[str] = Query(None, description="'all' for aggregated or seller_id"),
    auth: tuple = Depends(require_seller_token_with_owner),
    session: AsyncSession = Depends(get_session),
):
    """Customer metrics: new vs returning, retention, LTV, top customers."""
    seller_id, owner_id = auth
    target = await resolve_branch_target(branch, seller_id, owner_id, session)

    def _parse_date(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            return None

    start_date = _parse_date(date_from)
    end_date = _parse_date(date_to)

    if start_date and not end_date:
        end_date = start_date
    elif end_date and not start_date:
        start_date = end_date
    if start_date and end_date and start_date > end_date:
        start_date, end_date = end_date, start_date

    period_key = (period or "").lower()
    if not start_date and not end_date and period_key in {"1d", "7d", "30d"}:
        MSK = ZoneInfo("Europe/Moscow")
        today_msk = datetime.now(MSK).date()
        if period_key == "1d":
            start_day_msk = today_msk
        elif period_key == "7d":
            start_day_msk = today_msk - timedelta(days=6)
        else:
            start_day_msk = today_msk - timedelta(days=29)
        start_datetime_msk = datetime.combine(start_day_msk, datetime.min.time()).replace(tzinfo=MSK)
        end_datetime_msk = datetime.combine(today_msk, datetime.max.time()).replace(tzinfo=MSK)
        start_date = start_datetime_msk.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        end_date = end_datetime_msk.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

    service = OrderService(session)
    try:
        return await service.get_customer_stats(target, date_from=start_date, date_to=end_date)
    except Exception:
        logger.exception("get_customer_stats failed", seller_id=seller_id, branch=branch)
        return {
            "total_customers": 0,
            "new_customers": 0,
            "returning_customers": 0,
            "repeat_orders": 0,
            "retention_rate": 0.0,
            "avg_ltv": 0.0,
            "top_customers": [],
        }
