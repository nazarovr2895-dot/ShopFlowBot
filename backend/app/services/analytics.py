"""Analytics service — record page views and query visitor statistics."""
from datetime import date, datetime, timedelta
from typing import Optional, List, Dict, Any

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

        total_visitors = sum(r.unique_visitors for r in rows)
        total_shop = sum(r.shop_views for r in rows)
        total_product = sum(r.product_views for r in rows)
        total_orders = sum(r.orders_placed for r in rows)
        conversion = round(total_orders / total_visitors * 100, 1) if total_visitors else 0

        daily = [
            {
                'date': r.date.isoformat(),
                'unique_visitors': r.unique_visitors,
                'shop_views': r.shop_views,
                'product_views': r.product_views,
                'orders_placed': r.orders_placed,
                'conversion_rate': round(r.orders_placed / r.unique_visitors * 100, 1) if r.unique_visitors else 0,
            }
            for r in rows
        ]

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

        total_visitors = sum(r.unique_visitors for r in rows)
        total_shop = sum(r.shop_views for r in rows)
        total_product = sum(r.product_views for r in rows)
        total_orders = sum(r.orders_placed for r in rows)
        conversion = round(total_orders / total_visitors * 100, 1) if total_visitors else 0

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

        daily = []
        for d in sorted(by_date.keys()):
            entry = by_date[d]
            uv = entry['unique_visitors']
            entry['conversion_rate'] = round(entry['orders_placed'] / uv * 100, 1) if uv else 0
            daily.append(entry)

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

    # ---- Aggregation ----

    async def rollup_daily_stats(self, target_date: date) -> None:
        """Aggregate page_views for target_date into daily_stats rows (upsert)."""
        dt_from = datetime.combine(target_date, datetime.min.time())
        dt_to = datetime.combine(target_date, datetime.max.time())

        # Platform-wide stats
        q = select(
            func.count(func.distinct(PageView.session_id)).label('unique_visitors'),
            func.count().label('total_views'),
            func.count().filter(PageView.event_type == 'shop_view').label('shop_views'),
            func.count().filter(PageView.event_type == 'product_view').label('product_views'),
        ).where(PageView.created_at >= dt_from, PageView.created_at <= dt_to)

        result = await self.session.execute(q)
        row = result.one()

        # Orders for that day
        orders_q = select(func.count()).select_from(Order).where(
            cast(Order.created_at, Date) == target_date,
        )
        orders_count = (await self.session.execute(orders_q)).scalar() or 0

        # Upsert platform row (seller_id IS NULL)
        stmt = pg_insert(DailyStats).values(
            date=target_date,
            seller_id=None,
            unique_visitors=row.unique_visitors or 0,
            total_views=row.total_views or 0,
            shop_views=row.shop_views or 0,
            product_views=row.product_views or 0,
            orders_placed=orders_count,
        ).on_conflict_do_update(
            constraint='uq_daily_stats_date_seller',
            set_={
                'unique_visitors': row.unique_visitors or 0,
                'total_views': row.total_views or 0,
                'shop_views': row.shop_views or 0,
                'product_views': row.product_views or 0,
                'orders_placed': orders_count,
            },
        )
        await self.session.execute(stmt)

        # Per-seller stats
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
            # Orders for this seller on that day
            so_q = select(func.count()).select_from(Order).where(
                cast(Order.created_at, Date) == target_date,
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

    async def cleanup_old_events(self, days_to_keep: int = 90) -> int:
        """Delete page_views older than days_to_keep. Returns deleted count."""
        cutoff = datetime.utcnow() - timedelta(days=days_to_keep)
        result = await self.session.execute(
            delete(PageView).where(PageView.created_at < cutoff)
        )
        return result.rowcount
