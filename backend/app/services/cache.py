"""
Redis Cache Service for caching reference data.
Provides TTL-based caching for cities, districts, metro stations, and other lookup data.
"""
import json
from typing import Optional, Any, List
from redis.asyncio import Redis

from backend.app.core.config import REDIS_HOST, REDIS_PORT, REDIS_DB


class CacheService:
    """Service for caching operations using Redis."""
    
    _redis: Optional[Redis] = None
    
    # Default TTL values (in seconds)
    TTL_CITIES = 3600          # 1 hour - cities rarely change
    TTL_DISTRICTS = 3600       # 1 hour - districts rarely change
    TTL_METRO = 3600           # 1 hour - metro stations rarely change
    TTL_DEFAULT = 300          # 5 minutes - default for other data
    
    # Cache key prefixes
    KEY_CITIES = "cities:all"
    KEY_DISTRICTS = "districts:city:{city_id}"
    KEY_METRO = "metro:district:{district_id}"
    
    @classmethod
    async def get_redis(cls) -> Redis:
        """Get or create Redis connection."""
        if cls._redis is None:
            cls._redis = Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                db=REDIS_DB,
                decode_responses=True
            )
        return cls._redis
    
    @classmethod
    async def close(cls):
        """Close Redis connection."""
        if cls._redis:
            await cls._redis.close()
            cls._redis = None
    
    def __init__(self, redis: Redis):
        self.redis = redis
    
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        data = await self.redis.get(key)
        if data:
            return json.loads(data)
        return None
    
    async def set(self, key: str, value: Any, ttl: int = TTL_DEFAULT):
        """Set value in cache with TTL."""
        await self.redis.set(key, json.dumps(value, ensure_ascii=False), ex=ttl)
    
    async def delete(self, key: str):
        """Delete value from cache."""
        await self.redis.delete(key)
    
    async def delete_pattern(self, pattern: str):
        """Delete all keys matching pattern."""
        keys = await self.redis.keys(pattern)
        if keys:
            await self.redis.delete(*keys)
    
    # ----- Convenience methods for reference data -----
    
    async def get_cities(self) -> Optional[List[dict]]:
        """Get cached cities list."""
        return await self.get(self.KEY_CITIES)
    
    async def set_cities(self, cities: List[dict]):
        """Cache cities list."""
        await self.set(self.KEY_CITIES, cities, self.TTL_CITIES)
    
    async def invalidate_cities(self):
        """Invalidate cities cache."""
        await self.delete(self.KEY_CITIES)
    
    async def get_districts(self, city_id: int) -> Optional[List[dict]]:
        """Get cached districts list for a city."""
        key = self.KEY_DISTRICTS.format(city_id=city_id)
        return await self.get(key)
    
    async def set_districts(self, city_id: int, districts: List[dict]):
        """Cache districts list for a city."""
        key = self.KEY_DISTRICTS.format(city_id=city_id)
        await self.set(key, districts, self.TTL_DISTRICTS)
    
    async def invalidate_districts(self, city_id: Optional[int] = None):
        """Invalidate districts cache. If city_id is None, invalidate all."""
        if city_id:
            await self.delete(self.KEY_DISTRICTS.format(city_id=city_id))
        else:
            await self.delete_pattern("districts:city:*")
    
    async def get_metro(self, district_id: int) -> Optional[List[dict]]:
        """Get cached metro stations for a district."""
        key = self.KEY_METRO.format(district_id=district_id)
        return await self.get(key)
    
    async def set_metro(self, district_id: int, stations: List[dict]):
        """Cache metro stations for a district."""
        key = self.KEY_METRO.format(district_id=district_id)
        await self.set(key, stations, self.TTL_METRO)
    
    async def invalidate_metro(self, district_id: Optional[int] = None):
        """Invalidate metro cache. If district_id is None, invalidate all."""
        if district_id:
            await self.delete(self.KEY_METRO.format(district_id=district_id))
        else:
            await self.delete_pattern("metro:district:*")
    
    async def invalidate_all_references(self):
        """Invalidate all reference data caches."""
        await self.invalidate_cities()
        await self.invalidate_districts()
        await self.invalidate_metro()
