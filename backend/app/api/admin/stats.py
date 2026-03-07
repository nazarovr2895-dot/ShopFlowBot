"""Admin stats & visitor analytics endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_session
from backend.app.api.admin._common import logger, require_admin_token
from backend.app.services.sellers import SellerService
from backend.app.services.orders import OrderService

router = APIRouter()


# ============================================
# АНАЛИТИКА ПОСЕЩЕНИЙ
# ============================================

@router.get("/analytics/visitors")
async def get_visitor_analytics(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    _admin: None = Depends(require_admin_token),
):
    """Статистика посещений платформы: уники, просмотры, конверсия."""
    from datetime import date as date_type, timedelta
    from backend.app.services.analytics import AnalyticsService

    today = date_type.today()
    d_from = date_type.fromisoformat(date_from) if date_from else today - timedelta(days=6)
    d_to = date_type.fromisoformat(date_to) if date_to else today

    svc = AnalyticsService(session)
    analytics = await svc.get_platform_analytics(d_from, d_to)
    analytics['top_shops'] = await svc.get_platform_top_shops(d_from, d_to)
    analytics['top_products'] = await svc.get_platform_top_products(d_from, d_to)
    return analytics


# ============================================
# СТАТИСТИКА
# ============================================

@router.get("/stats/all")
async def get_all_stats(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    _admin: None = Depends(require_admin_token),
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
    _admin: None = Depends(require_admin_token),
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
async def get_seller_stats(fio: str, session: AsyncSession = Depends(get_session), _admin: None = Depends(require_admin_token)):
    """Статистика конкретного продавца по ФИО"""
    service = SellerService(session)
    return await service.get_seller_stats_by_fio(fio)


@router.get("/stats/limits")
async def get_limits_analytics(session: AsyncSession = Depends(get_session), _admin: None = Depends(require_admin_token)):
    """Аналитика загрузки лимитов продавцов: активные, исчерпавшие, средняя загрузка, разбивка по тарифам."""
    service = SellerService(session)
    try:
        return await service.get_limits_analytics()
    except Exception:
        logger.exception("get_limits_analytics failed")
        return {
            "total_sellers": 0,
            "active_today": 0,
            "exhausted": 0,
            "closed_today": 0,
            "no_limit": 0,
            "avg_load_pct": 0.0,
            "by_plan": {},
            "top_loaded": [],
        }
