import os
import sys
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from backend.app.core.limiter import limiter
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api import buyers, sellers, orders, admin, public
from backend.app.api import admin_auth, seller_auth, seller_web, auth
from backend.app.api.admin import require_admin_token
from backend.app.api.deps import get_session
from backend.app.services.cache import CacheService
from backend.app.core.logging import setup_logging, get_logger
from backend.app.core.settings import get_settings
from backend.app.core.metrics import PrometheusMiddleware, get_metrics_response

# Load and validate settings
try:
    settings = get_settings()
except ValueError as e:
    print(f"Configuration error: {e}", file=sys.stderr)
    sys.exit(1)

# Initialize structured logging
# Use JSON format in production
setup_logging(
    log_level=settings.LOG_LEVEL,
    json_format=settings.is_production
)

logger = get_logger(__name__)

# Log configuration status
logger.info(
    "Application configuration loaded",
    environment=settings.ENVIRONMENT,
    db_host=settings.DB_HOST,
    redis_host=settings.REDIS_HOST,
)


async def _daily_scheduler():
    """Background task: run daily at 03:00 MSK (00:00 UTC) for expiry, 09:00 MSK (06:00 UTC) for notifications."""
    import asyncio
    from datetime import datetime, timezone, timedelta

    msk = timezone(timedelta(hours=3))

    while True:
        try:
            now = datetime.now(tz=msk)
            # Next run at 09:00 MSK
            target = now.replace(hour=9, minute=0, second=0, microsecond=0)
            if now >= target:
                target += timedelta(days=1)
            wait_secs = (target - now).total_seconds()
            logger.info("Daily scheduler: sleeping", next_run=target.isoformat(), wait_seconds=int(wait_secs))
            await asyncio.sleep(wait_secs)

            # Run tasks
            from backend.app.core.database import async_session
            from backend.app.services.loyalty import expire_stale_points, get_all_sellers_upcoming_events
            from backend.app.services.telegram_notify import notify_seller_upcoming_events

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
                            await notify_seller_upcoming_events(sid, events)
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
                        # Notify buyers about status change
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

                # 4. Reconcile seller order counters (fix counter drift)
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
        except Exception as e:
            logger.error("Daily scheduler: unexpected error", error=str(e))
            import asyncio
            await asyncio.sleep(60)  # Wait before retrying


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.
    - Startup: initialize connections, start background scheduler
    - Shutdown: cleanup connections (Redis, etc.)
    """
    import asyncio
    # Startup
    logger.info("Application starting up", version="1.0.0")
    scheduler_task = asyncio.create_task(_daily_scheduler())
    yield
    # Shutdown: cancel scheduler, close Redis
    scheduler_task.cancel()
    logger.info("Application shutting down")
    await CacheService.close()


app = FastAPI(title="FlowShop Backend", lifespan=lifespan)

# Use shared limiter (routers use the same instance for @limiter.limit)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware для Mini App - ДОЛЖЕН БЫТЬ ПЕРВЫМ (выполняется последним при ответе)
# Use settings for CORS configuration
ALLOWED_ORIGINS = settings.allowed_origins_list
logger.info("CORS configuration", allowed_origins=ALLOWED_ORIGINS, is_production=settings.is_production, raw_allowed_origins=settings.ALLOWED_ORIGINS)
if not ALLOWED_ORIGINS:
    # In production, require ALLOWED_ORIGINS to be set
    if settings.is_production:
        logger.error("ALLOWED_ORIGINS must be set in production environment")
        raise ValueError("ALLOWED_ORIGINS environment variable is required in production")
    # Development fallback
    ALLOWED_ORIGINS = ["*"]
    logger.warning("CORS: Allowing all origins (development mode). Set ALLOWED_ORIGINS in production!")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Add Prometheus metrics middleware AFTER CORS (выполняется раньше при ответе)
app.add_middleware(PrometheusMiddleware)

# Подключаем роутеры (части нашего приложения)
app.include_router(auth.router, prefix="/auth", tags=["auth"])  # Authentication endpoints
app.include_router(public.router, prefix="/public", tags=["public"])  # Публичный API для Mini App
app.include_router(buyers.router, prefix="/buyers", tags=["buyers"])
app.include_router(sellers.router, prefix="/sellers", tags=["sellers"])
app.include_router(orders.router, prefix="/orders", tags=["orders"])
# Admin login - без токена (первым, чтобы /admin/login работал)
app.include_router(admin_auth.router, prefix="/admin", tags=["admin"])
# Seller web login (no token required)
app.include_router(seller_auth.router, prefix="/seller-web", tags=["seller-web"])
# Seller web API (X-Seller-Token required)
app.include_router(seller_web.router, prefix="/seller-web", tags=["seller-web"])
# Статика для загруженных фото товаров (seller web)
_static_dir = Path(__file__).resolve().parent.parent / "static"
_static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")
# Admin API - с проверкой токена
app.include_router(
    admin.router,
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin_token)],
)

@app.get("/")
async def root():
    return {"status": "ok"}


@app.get("/health")
async def health_check(session: AsyncSession = Depends(get_session)):
    """
    Health check endpoint for monitoring and orchestration.
    Checks database and Redis connectivity.
    """
    health_status = {
        "status": "healthy",
        "version": "1.0.0",
        "checks": {
            "database": "ok",
            "redis": "ok"
        }
    }
    
    # Check database connectivity
    try:
        await session.execute(text("SELECT 1"))
    except Exception as e:
        logger.error("Database health check failed", error=str(e))
        health_status["status"] = "unhealthy"
        health_status["checks"]["database"] = f"error: {str(e)}"
    
    # Check Redis connectivity
    try:
        redis = await CacheService.get_redis()
        await redis.ping()
    except Exception as e:
        logger.error("Redis health check failed", error=str(e))
        health_status["status"] = "unhealthy"
        health_status["checks"]["redis"] = f"error: {str(e)}"
    
    return health_status


@app.get("/metrics")
async def metrics_endpoint(openmetrics: bool = False):
    """
    Prometheus metrics endpoint.
    
    Args:
        openmetrics: If True, return OpenMetrics format
        
    Returns:
        Metrics in Prometheus or OpenMetrics format
    """
    return get_metrics_response(openmetrics=openmetrics)