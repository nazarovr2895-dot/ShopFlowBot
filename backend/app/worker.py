"""
Background worker process.
Runs scheduled tasks outside of the FastAPI web process.
Entry point: python -m backend.app.worker
"""
import asyncio
import signal
import sys

from backend.app.core.settings import get_settings

try:
    settings = get_settings()
except ValueError as e:
    print(f"Configuration error: {e}", file=sys.stderr)
    sys.exit(1)

from backend.app.core.logging import setup_logging, get_logger

setup_logging(log_level=settings.LOG_LEVEL, json_format=settings.is_production)
logger = get_logger("worker")

# Arbitrary constant for PostgreSQL advisory lock
WORKER_LOCK_ID = 736281


async def _acquire_advisory_lock():
    """
    Acquire a PostgreSQL session-level advisory lock.
    Blocks until the lock is available, ensuring only one worker runs tasks.
    The lock auto-releases if the process crashes (connection drops).
    """
    from sqlalchemy import text
    from backend.app.core.database import engine

    conn = await engine.connect()
    await conn.execute(text(f"SELECT pg_advisory_lock({WORKER_LOCK_ID})"))
    logger.info("Advisory lock acquired", lock_id=WORKER_LOCK_ID)
    return conn


async def _daily_scheduler():
    """Background task: run daily at 09:00 MSK for notifications, expiry, preorder activation."""
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import select

    msk = timezone(timedelta(hours=3))

    while True:
        try:
            now = datetime.now(tz=msk)
            target = now.replace(hour=9, minute=0, second=0, microsecond=0)
            if now >= target:
                target += timedelta(days=1)
            wait_secs = (target - now).total_seconds()
            logger.info("Daily scheduler: sleeping", next_run=target.isoformat(), wait_seconds=int(wait_secs))
            await asyncio.sleep(wait_secs)

            from backend.app.core.database import async_session
            from backend.app.services.loyalty import expire_stale_points, get_all_sellers_upcoming_events
            from backend.app.services.telegram_notify import notify_seller_upcoming_events, resolve_notification_chat_id

            async with async_session() as session:
                # 1. Expire stale points
                try:
                    n = await expire_stale_points(session)
                    await session.commit()
                    if n > 0:
                        logger.info("Daily scheduler: expired points", count=n)
                except Exception as e:
                    await session.rollback()
                    logger.error("Daily scheduler: expire_stale_points failed", error=str(e))

                # 2. Send event notifications to sellers
                try:
                    events_by_seller = await get_all_sellers_upcoming_events(session, days_ahead=7)
                    for sid, events in events_by_seller.items():
                        try:
                            _chat_id = await resolve_notification_chat_id(session, sid)
                            await notify_seller_upcoming_events(_chat_id, events)
                        except Exception as e:
                            logger.error("Daily scheduler: notify failed", seller_id=sid, error=str(e))
                    if events_by_seller:
                        logger.info("Daily scheduler: sent event notifications", sellers_count=len(events_by_seller))
                except Exception as e:
                    logger.error("Daily scheduler: get_all_sellers_upcoming_events failed", error=str(e))

                # 3. Auto-activate preorders whose delivery date is today
                try:
                    from backend.app.services.orders import activate_due_preorders
                    from backend.app.services.telegram_notify import notify_buyer_order_status

                    today_msk = datetime.now(tz=msk).date()
                    activated = await activate_due_preorders(session, today_msk)
                    if activated:
                        await session.commit()
                        for a in activated:
                            try:
                                await notify_buyer_order_status(
                                    buyer_id=a["buyer_id"],
                                    order_id=a["order_id"],
                                    new_status="assembling",
                                    seller_id=a["seller_id"],
                                    items_info=a.get("items_info"),
                                    total_price=a.get("total_price"),
                                )
                            except Exception as e:
                                logger.error("Preorder activation notify failed", order_id=a["order_id"], error=str(e))
                        logger.info("Daily scheduler: activated preorders", count=len(activated), date=str(today_msk))
                except Exception as e:
                    await session.rollback()
                    logger.error("Daily scheduler: preorder activation failed", error=str(e))

                # 4. Reconcile seller order counters
                try:
                    from backend.app.services.sellers import SellerService
                    seller_svc = SellerService(session)
                    fixed = await seller_svc.reconcile_all_counters()
                    if fixed > 0:
                        logger.info("Daily scheduler: reconciled seller counters", fixed=fixed)
                except Exception as e:
                    await session.rollback()
                    logger.error("Daily scheduler: reconcile_counters failed", error=str(e))

                # 5. Sync bouquet product quantities for all sellers
                try:
                    from backend.app.services.bouquets import sync_bouquet_product_quantities
                    from backend.app.models.seller import Seller
                    sellers_result = await session.execute(
                        select(Seller.seller_id).where(Seller.is_blocked == False)  # noqa: E712
                    )
                    seller_ids = [row[0] for row in sellers_result.all()]
                    synced_total = 0
                    for sid in seller_ids:
                        try:
                            n = await sync_bouquet_product_quantities(session, sid)
                            synced_total += n
                        except Exception as e:
                            logger.error("Daily sync: failed for seller", seller_id=sid, error=str(e))
                    await session.commit()
                    if synced_total > 0:
                        logger.info("Daily scheduler: synced bouquet product quantities", updated=synced_total)
                except Exception as e:
                    await session.rollback()
                    logger.error("Daily scheduler: bouquet sync failed", error=str(e))

                # 6. Expire overdue subscriptions and send expiry warnings
                try:
                    from backend.app.services.subscription import SubscriptionService
                    sub_svc = SubscriptionService(session)

                    expired_count = await sub_svc.expire_subscriptions()
                    if expired_count > 0:
                        await session.commit()
                        logger.info("Daily scheduler: expired subscriptions", count=expired_count)

                    await sub_svc.check_expiring_subscriptions()
                except Exception as e:
                    await session.rollback()
                    logger.error("Daily scheduler: subscription check failed", error=str(e))

                # 7. Clean up old analytics events (keep 90 days)
                try:
                    from backend.app.services.analytics import AnalyticsService
                    analytics_svc = AnalyticsService(session)
                    deleted = await analytics_svc.cleanup_old_events(days_to_keep=90)
                    if deleted > 0:
                        await session.commit()
                        logger.info("Daily scheduler: cleaned old analytics events", count=deleted)
                except Exception as e:
                    await session.rollback()
                    logger.error("Daily scheduler: analytics cleanup failed", error=str(e))

                # 8. Clean up expired refresh tokens
                try:
                    from backend.app.services.token_service import cleanup_expired_tokens
                    cleaned = await cleanup_expired_tokens(session)
                    await session.commit()
                    if cleaned > 0:
                        logger.info("Daily scheduler: cleaned expired refresh tokens", count=cleaned)
                except Exception as e:
                    await session.rollback()
                    logger.error("Daily scheduler: refresh token cleanup failed", error=str(e))
        except Exception as e:
            logger.error("Daily scheduler: unexpected error", error=str(e))
            await asyncio.sleep(60)


async def _reservation_sweeper():
    """Background task: release expired stock reservations every 60 seconds."""
    from backend.app.core.database import async_session
    from backend.app.services.reservations import ReservationService

    while True:
        try:
            await asyncio.sleep(60)
            async with async_session() as session:
                svc = ReservationService(session)
                released = await svc.release_all_expired()
                if released > 0:
                    await session.commit()
                    logger.info("Reservation sweeper: released expired reservations", count=released)
        except Exception as e:
            logger.error("Reservation sweeper error", error=str(e))
            await asyncio.sleep(10)


async def _analytics_aggregator():
    """Background task: roll up page_views into daily_stats every hour."""
    from datetime import date as date_type, timedelta
    from backend.app.core.database import async_session
    from backend.app.services.analytics import AnalyticsService

    while True:
        try:
            await asyncio.sleep(3600)
            async with async_session() as session:
                svc = AnalyticsService(session)
                today = date_type.today()
                yesterday = today - timedelta(days=1)
                await svc.rollup_daily_stats(yesterday)
                await svc.rollup_daily_stats(today)
                await session.commit()
                logger.info("Analytics aggregator: rolled up daily stats")
        except Exception as e:
            logger.error("Analytics aggregator error", error=str(e))
            await asyncio.sleep(60)


_shutdown_event = asyncio.Event()


def _signal_handler():
    logger.info("Shutdown signal received")
    _shutdown_event.set()


async def main():
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _signal_handler)

    lock_conn = await _acquire_advisory_lock()

    tasks = [
        asyncio.create_task(_daily_scheduler()),
        asyncio.create_task(_reservation_sweeper()),
        asyncio.create_task(_analytics_aggregator()),
    ]

    logger.info("Worker started, running 3 background tasks")

    await _shutdown_event.wait()

    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)

    await lock_conn.close()
    logger.info("Worker stopped")


if __name__ == "__main__":
    asyncio.run(main())
