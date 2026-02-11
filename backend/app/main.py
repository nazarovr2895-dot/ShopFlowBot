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
from sqlalchemy import text
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.
    - Startup: initialize connections
    - Shutdown: cleanup connections (Redis, etc.)
    """
    # Startup
    logger.info("Application starting up", version="1.0.0")
    yield
    # Shutdown: close Redis connection
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