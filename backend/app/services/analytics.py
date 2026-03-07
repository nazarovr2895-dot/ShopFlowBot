"""Analytics service — record page views and query visitor statistics."""
from datetime import date, datetime, time, timedelta
from typing import Optional, List, Dict, Any
from zoneinfo import ZoneInfo

from sqlalchemy import select, func, delete, case, cast, Date, literal
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.logging import get_logger
from backend.app.models.analytics import PageView, DailyStats
from backend.app.models.order import Order
from backend.app.models.seller import Seller
from backend.app.models.product import Product

logger = get_logger(__name__)

ALLOWED_EVENTS = {'app_open', 'shop_view', 'product_view'}
MAX_BATCH = 50
MSK = ZoneInfo("Europe/Moscow")


def _fill_date_range(by_date: Dict[str, Dict], date_from: date, date_to: date) -> List[Dict]:
    """Fill missing dates with zero entries and add conversion_rate to each day."""
    daily = []
    d = date_from
    while d <= date_to:
        d_iso = d.isoformat()
        entry = by_date.get(d_iso, {
            'date': d_iso,
            'unique_visitors': 0,
            'shop_views': 0,
            'product_views': 0,
            'orders_placed': 0,
        })
        uv = entry.get('unique_visitors', 0)
        entry['conversion_rate'] = round(entry['orders_placed'] / uv * 100, 1) if uv else 0
        daily.append(entry)
        d += timedelta(days=1)
    return daily


class AnalyticsService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ---- Write ----

    async def record_events(
        self,
        session_id: str,
        visitor_id: Optional[int],
        events: List[Dict[str, Any]],
    ) -> int:
        """Bulk-insert page view events. Returns count of inserted rows."""
        rows = []
        for ev in events[:MAX_BATCH]:
            etype = ev.get('event_type')
            if etype not in ALLOWED_EVENTS:
                continue
            rows.append(PageView(
                session_id=session_id,
                visitor_id=visitor_id,
                event_type=etype,
                seller_id=ev.get('seller_id'),
                product_id=ev.get('product_id'),
            ))
        if rows:
            self.session.add_all(rows)
            await self.session.flush()
        return len(rows)

    # ---- Platform analytics (admin) ----

    async def get_platform_analytics(
        self, date_from: date, date_to: date,
    ) -> Dict[str, Any]:
        """Aggregated platform stats from daily_stats (seller_id IS NULL)."""
        q = (
            select(DailyStats)
            .where(DailyStats.seller_id.is_(None))
            .where(DailyStats.date >= date_from, DailyStats.date <= date_to)
            .order_by(DailyStats.date)
        )
        result = await self.session.execute(q)
        rows = result.scalars().all()

        # Build daily map from DB rows (one row per date expected after rollup fix)
        by_date: Dict[str, Dict] = {}
        for r in rows:
            d = r.date.isoformat()
            # Take latest row per date (handles legacy duplicates from NULL constraint bug)
            by_date[d] = {
                'date': d,
                'unique_visitors': r.unique_visitors,
                'shop_views': r.shop_views,
                'product_views': r.product_views,
                'orders_placed': r.orders_placed,
            }

        # Fill missing dates with zeros
        daily = _fill_date_range(by_date, date_from, date_to)

        total_shop = sum(d['shop_views'] for d in daily)
        total_product = sum(d['product_views'] for d in daily)
        total_orders = sum(d['orders_placed'] for d in daily)

        # True unique visitors across entire period (not sum of daily)
        total_visitors = await self._count_unique_visitors(date_from, date_to)

        conversion = round(total_orders / total_visitors * 100, 1) if total_visitors else 0

        return {
            'summary': {
                'unique_visitors': total_visitors,
                'shop_views': total_shop,
                'product_views': total_product,
                'orders_placed': total_orders,
                'conversion_rate': conversion,
            },
            'daily': daily,
        }

    async def get_platform_top_shops(
        self, date_from: date, date_to: date, limit: int = 10,
    ) -> List[Dict[str, Any]]:
        dt_from = datetime.combine(date_from, datetime.min.time())
        dt_to = datetime.combine(date_to, datetime.max.time())
        q = (
            select(
                PageView.seller_id,
                Seller.shop_name,
                func.count().label('views'),
                func.count(func.distinct(PageView.session_id)).label('unique_visitors'),
            )
            .join(Seller, Seller.seller_id == PageView.seller_id)
            .where(
                PageView.event_type == 'shop_view',
                PageView.created_at >= dt_from,
                PageView.created_at <= dt_to,
                PageView.seller_id.isnot(None),
            )
            .group_by(PageView.seller_id, Seller.shop_name)
            .order_by(func.count().desc())
            .limit(limit)
        )
        result = await self.session.execute(q)
        return [
            {'seller_id': r.seller_id, 'shop_name': r.shop_name, 'views': r.views, 'unique_visitors': r.unique_visitors}
            for r in result.all()
        ]

    async def get_platform_top_products(
        self, date_from: date, date_to: date, limit: int = 10,
    ) -> List[Dict[str, Any]]:
        dt_from = datetime.combine(date_from, datetime.min.time())
        dt_to = datetime.combine(date_to, datetime.max.time())
        q = (
            select(
                PageView.product_id,
                Product.name.label('product_name'),
                Seller.shop_name.label('seller_name'),
                func.count().label('views'),
            )
            .join(Product, Product.id == PageView.product_id)
            .join(Seller, Seller.seller_id == Product.seller_id)
            .where(
                PageView.event_type == 'product_view',
                PageView.created_at >= dt_from,
                PageView.created_at <= dt_to,
                PageView.product_id.isnot(None),
            )
            .group_by(PageView.product_id, Product.name, Seller.shop_name)
            .order_by(func.count().desc())
            .limit(limit)
        )
        result = await self.session.execute(q)
        return [
            {'product_id': r.product_id, 'product_name': r.product_name, 'seller_name': r.seller_name, 'views': r.views}
            for r in result.all()
        ]

    # ---- Seller analytics ----

    async def get_seller_analytics(
        self,
        seller_id: int | List[int],
        date_from: date,
        date_to: date,
    ) -> Dict[str, Any]:
        """Per-seller stats from daily_stats."""
        if isinstance(seller_id, list):
            flt = DailyStats.seller_id.in_(seller_id)
        else:
            flt = DailyStats.seller_id == seller_id

        q = (
            select(DailyStats)
            .where(flt, DailyStats.date >= date_from, DailyStats.date <= date_to)
            .order_by(DailyStats.date)
        )
        result = await self.session.execute(q)
        rows = result.scalars().all()

        # Aggregate by date for multi-branch
        by_date: Dict[str, Dict] = {}
        for r in rows:
            d = r.date.isoformat()
            if d not in by_date:
                by_date[d] = {'date': d, 'unique_visitors': 0, 'shop_views': 0, 'product_views': 0, 'orders_placed': 0}
            by_date[d]['unique_visitors'] += r.unique_visitors
            by_date[d]['shop_views'] += r.shop_views
            by_date[d]['product_views'] += r.product_views
            by_date[d]['orders_placed'] += r.orders_placed

        # Fill missing dates with zeros
        daily = _fill_date_range(by_date, date_from, date_to)

        total_shop = sum(d['shop_views'] for d in daily)
        total_product = sum(d['product_views'] for d in daily)
        total_orders = sum(d['orders_placed'] for d in daily)

        # True unique visitors across entire period
        total_visitors = await self._count_unique_visitors(date_from, date_to, seller_id)

        conversion = round(total_orders / total_visitors * 100, 1) if total_visitors else 0

        return {
            'summary': {
                'unique_visitors': total_visitors,
                'shop_views': total_shop,
                'product_views': total_product,
                'orders_placed': total_orders,
                'conversion_rate': conversion,
            },
            'daily': daily,
        }

    async def get_seller_top_products(
        self,
        seller_id: int | List[int],
        date_from: date,
        date_to: date,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        dt_from = datetime.combine(date_from, datetime.min.time())
        dt_to = datetime.combine(date_to, datetime.max.time())

        if isinstance(seller_id, list):
            seller_flt = PageView.seller_id.in_(seller_id)
        else:
            seller_flt = PageView.seller_id == seller_id

        q = (
            select(
                PageView.product_id,
                Product.name.label('product_name'),
                func.count().label('views'),
            )
            .join(Product, Product.id == PageView.product_id)
            .where(
                PageView.event_type == 'product_view',
                seller_flt,
                PageView.created_at >= dt_from,
                PageView.created_at <= dt_to,
                PageView.product_id.isnot(None),
            )
            .group_by(PageView.product_id, Product.name)
            .order_by(func.count().desc())
            .limit(limit)
        )
        result = await self.session.execute(q)
        return [
            {'product_id': r.product_id, 'product_name': r.product_name, 'views': r.views}
            for r in result.all()
        ]

    # ---- Helpers ----

    async def _count_unique_visitors(
        self,
        date_from: date,
        date_to: date,
        seller_id: Optional[int | List[int]] = None,
    ) -> int:
        """Count truly unique visitors (distinct session_id) across a date range."""
        dt_from = datetime.combine(date_from, time.min)
        dt_to = datetime.combine(date_to, time.max)
        q = select(func.count(func.distinct(PageView.session_id))).where(
            PageView.created_at >= dt_from,
            PageView.created_at <= dt_to,
        )
        if seller_id is not None:
            if isinstance(seller_id, list):
                q = q.where(PageView.seller_id.in_(seller_id))
            else:
                q = q.where(PageView.seller_id == seller_id)
        return (await self.session.execute(q)).scalar() or 0

    # ---- Aggregation ----

    async def rollup_daily_stats(self, target_date: date) -> None:
        """Aggregate page_views for target_date into daily_stats rows.

        Uses Moscow timezone for day boundaries. For platform rows (seller_id IS NULL),
        deletes and re-inserts to avoid PostgreSQL NULL unique constraint issue.
        """
        # Moscow day boundaries converted to UTC for querying page_views
        dt_from_msk = datetime.combine(target_date, time.min, tzinfo=MSK)
        dt_to_msk = datetime.combine(target_date, time.max, tzinfo=MSK)
        dt_from = dt_from_msk.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        dt_to = dt_to_msk.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

        # Platform-wide stats
        q = select(
            func.count(func.distinct(PageView.session_id)).label('unique_visitors'),
            func.count().label('total_views'),
            func.count().filter(PageView.event_type == 'shop_view').label('shop_views'),
            func.count().filter(PageView.event_type == 'product_view').label('product_views'),
        ).where(PageView.created_at >= dt_from, PageView.created_at <= dt_to)

        result = await self.session.execute(q)
        row = result.one()

        # Orders for that day (also using Moscow day boundaries)
        orders_q = select(func.count()).select_from(Order).where(
            Order.created_at >= dt_from,
            Order.created_at <= dt_to,
        )
        orders_count = (await self.session.execute(orders_q)).scalar() or 0

        # Delete + insert for platform row (seller_id IS NULL)
        # PostgreSQL NULLs are DISTINCT in unique constraints, so ON CONFLICT won't fire
        await self.session.execute(
            delete(DailyStats).where(
                DailyStats.date == target_date,
                DailyStats.seller_id.is_(None),
            )
        )
        self.session.add(DailyStats(
            date=target_date,
            seller_id=None,
            unique_visitors=row.unique_visitors or 0,
            total_views=row.total_views or 0,
            shop_views=row.shop_views or 0,
            product_views=row.product_views or 0,
            orders_placed=orders_count,
        ))
        await self.session.flush()

        # Per-seller stats (ON CONFLICT works fine here — seller_id is NOT NULL)
        seller_q = (
            select(
                PageView.seller_id,
                func.count(func.distinct(PageView.session_id)).label('unique_visitors'),
                func.count().label('total_views'),
                func.count().filter(PageView.event_type == 'shop_view').label('shop_views'),
                func.count().filter(PageView.event_type == 'product_view').label('product_views'),
            )
            .where(
                PageView.created_at >= dt_from,
                PageView.created_at <= dt_to,
                PageView.seller_id.isnot(None),
            )
            .group_by(PageView.seller_id)
        )
        seller_result = await self.session.execute(seller_q)

        for sr in seller_result.all():
            so_q = select(func.count()).select_from(Order).where(
                Order.created_at >= dt_from,
                Order.created_at <= dt_to,
                Order.seller_id == sr.seller_id,
            )
            seller_orders = (await self.session.execute(so_q)).scalar() or 0

            stmt = pg_insert(DailyStats).values(
                date=target_date,
                seller_id=sr.seller_id,
                unique_visitors=sr.unique_visitors or 0,
                total_views=sr.total_views or 0,
                shop_views=sr.shop_views or 0,
                product_views=sr.product_views or 0,
                orders_placed=seller_orders,
            ).on_conflict_do_update(
                constraint='uq_daily_stats_date_seller',
                set_={
                    'unique_visitors': sr.unique_visitors or 0,
                    'total_views': sr.total_views or 0,
                    'shop_views': sr.shop_views or 0,
                    'product_views': sr.product_views or 0,
                    'orders_placed': seller_orders,
                },
            )
            await self.session.execute(stmt)

        logger.info("Analytics rollup complete", date=str(target_date))

    async def cleanup_duplicate_platform_rows(self) -> int:
        """Remove duplicate platform rows (seller_id IS NULL) created by the NULL constraint bug.

        Keeps the row with the highest id per date (latest rollup) and deletes the rest.
        """
        # Find dates that have duplicates
        sub = (
            select(
                DailyStats.date,
                func.max(DailyStats.id).label('keep_id'),
                func.count().label('cnt'),
            )
            .where(DailyStats.seller_id.is_(None))
            .group_by(DailyStats.date)
            .having(func.count() > 1)
            .subquery()
        )
        # Get all IDs to keep
        keep_q = select(sub.c.keep_id)
        keep_result = await self.session.execute(keep_q)
        keep_ids = {r[0] for r in keep_result.all()}

        if not keep_ids:
            return 0

        # Get dates with duplicates
        dates_q = select(sub.c.date)
        dates_result = await self.session.execute(dates_q)
        dup_dates = [r[0] for r in dates_result.all()]

        # Delete all platform rows for those dates except the ones to keep
        result = await self.session.execute(
            delete(DailyStats).where(
                DailyStats.seller_id.is_(None),
                DailyStats.date.in_(dup_dates),
                DailyStats.id.notin_(keep_ids),
            )
        )
        deleted = result.rowcount
        if deleted:
            logger.info("Cleaned up duplicate platform daily_stats rows", deleted=deleted)
        return deleted

    async def cleanup_old_events(self, days_to_keep: int = 90) -> int:
        """Delete page_views older than days_to_keep. Returns deleted count."""
        cutoff = datetime.utcnow() - timedelta(days=days_to_keep)
        result = await self.session.execute(
            delete(PageView).where(PageView.created_at < cutoff)
        )
        return result.rowcount
