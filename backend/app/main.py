import os
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api import buyers, sellers, orders, agents, admin, public
from backend.app.api import admin_auth, seller_auth, seller_web
from backend.app.api.admin import require_admin_token
from backend.app.api.deps import get_session
from backend.app.services.cache import CacheService
from backend.app.core.logging import setup_logging, get_logger

# Initialize structured logging
# Use JSON format in production (when ENVIRONMENT != "development")
is_production = os.getenv("ENVIRONMENT", "production") != "development"
setup_logging(
    log_level=os.getenv("LOG_LEVEL", "INFO"),
    json_format=is_production
)

logger = get_logger(__name__)


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

# CORS middleware для Mini App
# В продакшене задать ALLOWED_ORIGINS через переменную окружения
# Например: "https://miniapp.example.com,https://t.me"
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if ALLOWED_ORIGINS[0] else ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Подключаем роутеры (части нашего приложения)
app.include_router(public.router, prefix="/public", tags=["public"])  # Публичный API для Mini App
app.include_router(buyers.router, prefix="/buyers", tags=["buyers"])
app.include_router(sellers.router, prefix="/sellers", tags=["sellers"])
app.include_router(orders.router, prefix="/orders", tags=["orders"])
app.include_router(agents.router, prefix="/agents", tags=["agents"])
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