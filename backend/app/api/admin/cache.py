"""КЭШИРОВАНИЕ — cache invalidation endpoint."""

from fastapi import APIRouter, Depends, HTTPException
from typing import Optional

from backend.app.api.deps import get_cache
from backend.app.services.cache import CacheService
from backend.app.api.admin._common import logger

router = APIRouter()


@router.post("/cache/invalidate")
async def invalidate_cache(
    cache_type: Optional[str] = None,
    cache: CacheService = Depends(get_cache)
):
    """
    Сбросить кэш справочников.

    - cache_type=None: сбросить весь кэш (города, районы, метро)
    - cache_type="cities": сбросить только кэш городов
    - cache_type="districts": сбросить только кэш районов
    - cache_type="metro": сбросить только кэш метро
    """
    logger.info("Cache invalidation requested", cache_type=cache_type or "all")

    if cache_type is None:
        await cache.invalidate_all_references()
        logger.info("Cache invalidated", cache_type="all")
        return {"status": "ok", "invalidated": "all"}
    elif cache_type == "cities":
        await cache.invalidate_cities()
        logger.info("Cache invalidated", cache_type="cities")
        return {"status": "ok", "invalidated": "cities"}
    elif cache_type == "districts":
        await cache.invalidate_districts()
        logger.info("Cache invalidated", cache_type="districts")
        return {"status": "ok", "invalidated": "districts"}
    elif cache_type == "metro":
        await cache.invalidate_metro()
        logger.info("Cache invalidated", cache_type="metro")
        return {"status": "ok", "invalidated": "metro"}
    else:
        logger.warning("Invalid cache type requested", cache_type=cache_type)
        raise HTTPException(
            status_code=400,
            detail=f"Invalid cache_type: {cache_type}. Use: cities, districts, metro, or omit for all."
        )
