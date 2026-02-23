"""Admin endpoints for managing coverage areas: cities, districts, metro stations."""
import os
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from typing import Optional, List
from pydantic import BaseModel

from backend.app.api.deps import get_session, get_cache
from backend.app.core.logging import get_logger
from backend.app.models.seller import City, District, Metro, Seller
from backend.app.models.user import User
from backend.app.services.cache import CacheService
from backend.app.services.dadata_address import (
    suggest_city as dadata_suggest_city,
    suggest_district as dadata_suggest_district,
    fetch_metro_stations as dadata_fetch_metro,
    resolve_district_from_coordinates,
)

router = APIRouter()
logger = get_logger(__name__)

ADMIN_SECRET = os.getenv("ADMIN_SECRET", "")


async def require_admin_token(x_admin_token: Optional[str] = Header(None, alias="X-Admin-Token")):
    if not ADMIN_SECRET:
        raise HTTPException(status_code=503, detail="Admin panel not configured (ADMIN_SECRET missing)")
    if not x_admin_token or x_admin_token != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Invalid or missing admin token")


# ── Schemas ──────────────────────────────────────────────────────

class CityCreate(BaseModel):
    name: str
    kladr_id: Optional[str] = None

class CityUpdate(BaseModel):
    name: Optional[str] = None
    kladr_id: Optional[str] = None

class DistrictCreate(BaseModel):
    name: str

class DistrictUpdate(BaseModel):
    name: str

class MetroCreate(BaseModel):
    name: str
    line_color: Optional[str] = None
    line_name: Optional[str] = None
    geo_lat: Optional[float] = None
    geo_lon: Optional[float] = None

class MetroUpdate(BaseModel):
    name: Optional[str] = None
    district_id: Optional[int] = None
    line_color: Optional[str] = None
    line_name: Optional[str] = None


# ── Cities CRUD ──────────────────────────────────────────────────

@router.get("/coverage/cities")
async def list_cities(
    session: AsyncSession = Depends(get_session),
    _token: None = Depends(require_admin_token),
):
    """List all cities with counts of districts, metro stations, and sellers."""
    # Base city query
    cities_q = await session.execute(select(City).order_by(City.name))
    cities = cities_q.scalars().all()

    result = []
    for city in cities:
        # Count districts
        districts_count = await session.scalar(
            select(func.count(District.id)).where(District.city_id == city.id)
        )
        # Count metro stations
        metro_count = await session.scalar(
            select(func.count(Metro.id)).where(Metro.city_id == city.id)
        )
        # Count sellers
        sellers_count = await session.scalar(
            select(func.count(Seller.seller_id)).where(
                Seller.city_id == city.id,
                Seller.deleted_at.is_(None),
            )
        )
        result.append({
            "id": city.id,
            "name": city.name,
            "kladr_id": city.kladr_id,
            "districts_count": districts_count or 0,
            "metro_count": metro_count or 0,
            "sellers_count": sellers_count or 0,
        })

    return result


@router.post("/coverage/cities")
async def create_city(
    body: CityCreate,
    session: AsyncSession = Depends(get_session),
    cache: CacheService = Depends(get_cache),
    _token: None = Depends(require_admin_token),
):
    if not body.name or not body.name.strip():
        raise HTTPException(400, "Название города обязательно")

    # Check duplicate name
    existing = await session.scalar(
        select(City.id).where(func.lower(City.name) == body.name.strip().lower())
    )
    if existing:
        raise HTTPException(400, f"Город '{body.name.strip()}' уже существует")

    city = City(name=body.name.strip(), kladr_id=body.kladr_id)
    session.add(city)
    await session.commit()
    await session.refresh(city)
    await cache.invalidate_cities()

    return {"id": city.id, "name": city.name, "kladr_id": city.kladr_id,
            "districts_count": 0, "metro_count": 0, "sellers_count": 0}


@router.put("/coverage/cities/{city_id}")
async def update_city(
    city_id: int,
    body: CityUpdate,
    session: AsyncSession = Depends(get_session),
    cache: CacheService = Depends(get_cache),
    _token: None = Depends(require_admin_token),
):
    city = await session.get(City, city_id)
    if not city:
        raise HTTPException(404, "Город не найден")

    if body.name is not None:
        city.name = body.name.strip()
    if body.kladr_id is not None:
        city.kladr_id = body.kladr_id or None

    await session.commit()
    await cache.invalidate_cities()
    return {"id": city.id, "name": city.name, "kladr_id": city.kladr_id}


@router.delete("/coverage/cities/{city_id}")
async def delete_city(
    city_id: int,
    session: AsyncSession = Depends(get_session),
    cache: CacheService = Depends(get_cache),
    _token: None = Depends(require_admin_token),
):
    city = await session.get(City, city_id)
    if not city:
        raise HTTPException(404, "Город не найден")

    # Check references
    sellers_count = await session.scalar(
        select(func.count(Seller.seller_id)).where(Seller.city_id == city_id, Seller.deleted_at.is_(None))
    )
    if sellers_count:
        raise HTTPException(400, f"Нельзя удалить: {sellers_count} продавцов привязаны к этому городу")

    users_count = await session.scalar(
        select(func.count(User.tg_id)).where(User.city_id == city_id)
    )
    if users_count:
        raise HTTPException(400, f"Нельзя удалить: {users_count} пользователей привязаны к этому городу")

    # Delete metro stations for this city first
    await session.execute(delete(Metro).where(Metro.city_id == city_id))
    # Delete districts
    await session.execute(delete(District).where(District.city_id == city_id))
    # Delete city
    await session.delete(city)
    await session.commit()
    await cache.invalidate_cities()
    return {"status": "ok"}


# ── Districts CRUD ───────────────────────────────────────────────

@router.get("/coverage/cities/{city_id}/districts")
async def list_districts(
    city_id: int,
    session: AsyncSession = Depends(get_session),
    _token: None = Depends(require_admin_token),
):
    city = await session.get(City, city_id)
    if not city:
        raise HTTPException(404, "Город не найден")

    districts_q = await session.execute(
        select(District).where(District.city_id == city_id).order_by(District.name)
    )
    districts = districts_q.scalars().all()

    result = []
    for d in districts:
        metro_count = await session.scalar(
            select(func.count(Metro.id)).where(Metro.district_id == d.id)
        )
        sellers_count = await session.scalar(
            select(func.count(Seller.seller_id)).where(
                Seller.district_id == d.id, Seller.deleted_at.is_(None)
            )
        )
        result.append({
            "id": d.id,
            "name": d.name,
            "city_id": d.city_id,
            "metro_count": metro_count or 0,
            "sellers_count": sellers_count or 0,
        })
    return result


@router.post("/coverage/cities/{city_id}/districts")
async def create_district(
    city_id: int,
    body: DistrictCreate,
    session: AsyncSession = Depends(get_session),
    cache: CacheService = Depends(get_cache),
    _token: None = Depends(require_admin_token),
):
    city = await session.get(City, city_id)
    if not city:
        raise HTTPException(404, "Город не найден")

    if not body.name or not body.name.strip():
        raise HTTPException(400, "Название района обязательно")

    # Check duplicate
    existing = await session.scalar(
        select(District.id).where(
            District.city_id == city_id,
            func.lower(District.name) == body.name.strip().lower(),
        )
    )
    if existing:
        raise HTTPException(400, f"Район '{body.name.strip()}' уже существует в этом городе")

    district = District(city_id=city_id, name=body.name.strip())
    session.add(district)
    await session.commit()
    await session.refresh(district)
    await cache.invalidate_districts()

    return {"id": district.id, "name": district.name, "city_id": district.city_id,
            "metro_count": 0, "sellers_count": 0}


@router.put("/coverage/districts/{district_id}")
async def update_district(
    district_id: int,
    body: DistrictUpdate,
    session: AsyncSession = Depends(get_session),
    cache: CacheService = Depends(get_cache),
    _token: None = Depends(require_admin_token),
):
    district = await session.get(District, district_id)
    if not district:
        raise HTTPException(404, "Район не найден")

    district.name = body.name.strip()
    await session.commit()
    await cache.invalidate_districts()
    return {"id": district.id, "name": district.name, "city_id": district.city_id}


@router.delete("/coverage/districts/{district_id}")
async def delete_district(
    district_id: int,
    session: AsyncSession = Depends(get_session),
    cache: CacheService = Depends(get_cache),
    _token: None = Depends(require_admin_token),
):
    district = await session.get(District, district_id)
    if not district:
        raise HTTPException(404, "Район не найден")

    sellers_count = await session.scalar(
        select(func.count(Seller.seller_id)).where(
            Seller.district_id == district_id, Seller.deleted_at.is_(None)
        )
    )
    if sellers_count:
        raise HTTPException(400, f"Нельзя удалить: {sellers_count} продавцов привязаны к этому району")

    metro_count = await session.scalar(
        select(func.count(Metro.id)).where(Metro.district_id == district_id)
    )
    if metro_count:
        raise HTTPException(400, f"Нельзя удалить: {metro_count} станций метро привязаны к этому району. Сначала переместите или удалите их.")

    await session.delete(district)
    await session.commit()
    await cache.invalidate_districts()
    return {"status": "ok"}


# ── Metro CRUD ───────────────────────────────────────────────────

@router.get("/coverage/districts/{district_id}/metro")
async def list_metro_by_district(
    district_id: int,
    session: AsyncSession = Depends(get_session),
    _token: None = Depends(require_admin_token),
):
    district = await session.get(District, district_id)
    if not district:
        raise HTTPException(404, "Район не найден")

    q = await session.execute(
        select(Metro).where(Metro.district_id == district_id).order_by(Metro.name)
    )
    stations = q.scalars().all()
    return [_metro_to_dict(s) for s in stations]


@router.get("/coverage/cities/{city_id}/metro")
async def list_metro_by_city(
    city_id: int,
    session: AsyncSession = Depends(get_session),
    _token: None = Depends(require_admin_token),
):
    """List ALL metro stations for a city, including unmapped ones."""
    city = await session.get(City, city_id)
    if not city:
        raise HTTPException(404, "Город не найден")

    q = await session.execute(
        select(Metro).where(Metro.city_id == city_id).order_by(Metro.line_name, Metro.name)
    )
    stations = q.scalars().all()
    return [_metro_to_dict(s) for s in stations]


@router.post("/coverage/districts/{district_id}/metro")
async def create_metro_station(
    district_id: int,
    body: MetroCreate,
    session: AsyncSession = Depends(get_session),
    cache: CacheService = Depends(get_cache),
    _token: None = Depends(require_admin_token),
):
    district = await session.get(District, district_id)
    if not district:
        raise HTTPException(404, "Район не найден")

    if not body.name or not body.name.strip():
        raise HTTPException(400, "Название станции обязательно")

    station = Metro(
        district_id=district_id,
        city_id=district.city_id,
        name=body.name.strip(),
        line_color=body.line_color,
        line_name=body.line_name,
        geo_lat=body.geo_lat,
        geo_lon=body.geo_lon,
    )
    session.add(station)
    await session.commit()
    await session.refresh(station)
    await cache.invalidate_metro()
    return _metro_to_dict(station)


@router.put("/coverage/metro/{metro_id}")
async def update_metro_station(
    metro_id: int,
    body: MetroUpdate,
    session: AsyncSession = Depends(get_session),
    cache: CacheService = Depends(get_cache),
    _token: None = Depends(require_admin_token),
):
    station = await session.get(Metro, metro_id)
    if not station:
        raise HTTPException(404, "Станция не найдена")

    if body.name is not None:
        station.name = body.name.strip()
    if body.district_id is not None:
        # Verify district exists
        district = await session.get(District, body.district_id)
        if not district:
            raise HTTPException(400, "Район не найден")
        station.district_id = body.district_id
    if body.line_color is not None:
        station.line_color = body.line_color or None
    if body.line_name is not None:
        station.line_name = body.line_name or None

    await session.commit()
    await cache.invalidate_metro()
    return _metro_to_dict(station)


@router.delete("/coverage/metro/{metro_id}")
async def delete_metro_station(
    metro_id: int,
    session: AsyncSession = Depends(get_session),
    cache: CacheService = Depends(get_cache),
    _token: None = Depends(require_admin_token),
):
    station = await session.get(Metro, metro_id)
    if not station:
        raise HTTPException(404, "Станция не найдена")

    sellers_count = await session.scalar(
        select(func.count(Seller.seller_id)).where(
            Seller.metro_id == metro_id, Seller.deleted_at.is_(None)
        )
    )
    if sellers_count:
        raise HTTPException(400, f"Нельзя удалить: {sellers_count} продавцов привязаны к этой станции")

    await session.delete(station)
    await session.commit()
    await cache.invalidate_metro()
    return {"status": "ok"}


# ── DaData integration ───────────────────────────────────────────

@router.get("/coverage/dadata/suggest-city")
async def dadata_suggest_city_endpoint(
    q: str = Query(..., min_length=1),
    _token: None = Depends(require_admin_token),
):
    """Autocomplete city names via DaData."""
    results = await dadata_suggest_city(q.strip(), count=10)
    return results


@router.get("/coverage/dadata/suggest-district")
async def dadata_suggest_district_endpoint(
    q: str = Query(..., min_length=1),
    city_kladr_id: str = Query(..., min_length=1),
    _token: None = Depends(require_admin_token),
):
    """Autocomplete district names within a city via DaData."""
    results = await dadata_suggest_district(q.strip(), city_kladr_id=city_kladr_id)
    return results


@router.post("/coverage/cities/{city_id}/import-metro")
async def import_metro_from_dadata(
    city_id: int,
    session: AsyncSession = Depends(get_session),
    cache: CacheService = Depends(get_cache),
    _token: None = Depends(require_admin_token),
):
    """Fetch all metro stations from DaData and import them into DB."""
    city = await session.get(City, city_id)
    if not city:
        raise HTTPException(404, "Город не найден")
    if not city.kladr_id:
        raise HTTPException(400, "У города не указан КЛАДР-код. Обновите город перед импортом метро.")

    logger.info("Starting metro import from DaData", city=city.name, kladr_id=city.kladr_id)

    # Fetch all stations from DaData
    dadata_stations = await dadata_fetch_metro(city.kladr_id)
    if not dadata_stations:
        return {"imported": 0, "skipped": 0, "unmapped": 0, "details": [],
                "message": "DaData не вернул станций для этого города"}

    # Load existing station names for dedup
    existing_q = await session.execute(
        select(Metro.name).where(Metro.city_id == city_id)
    )
    existing_names = {row[0].lower() for row in existing_q.fetchall()}

    # Load districts for mapping
    districts_q = await session.execute(
        select(District).where(District.city_id == city_id)
    )
    districts = districts_q.scalars().all()
    district_by_name = {d.name.lower(): d.id for d in districts}

    imported = 0
    skipped = 0
    unmapped = 0
    details = []

    # Cache for coordinate-based district resolution (round to 3 decimals)
    coord_cache: dict[str, Optional[str]] = {}

    for station_data in dadata_stations:
        name = station_data["name"]

        # Skip if already exists
        if name.lower() in existing_names:
            details.append({"name": name, "status": "skipped", "line_name": station_data.get("line_name")})
            skipped += 1
            continue

        # Resolve district from coordinates
        district_id = None
        lat = station_data.get("geo_lat")
        lon = station_data.get("geo_lon")

        if lat and lon:
            # Cache key: rounded coordinates
            cache_key = f"{round(lat, 3)},{round(lon, 3)}"
            if cache_key in coord_cache:
                district_name = coord_cache[cache_key]
            else:
                district_name = await resolve_district_from_coordinates(lat, lon)
                coord_cache[cache_key] = district_name

            if district_name:
                district_id = district_by_name.get(district_name.lower())

        # Create station
        station = Metro(
            name=name,
            city_id=city_id,
            district_id=district_id,
            line_color=station_data.get("line_color"),
            line_name=station_data.get("line_name"),
            geo_lat=lat,
            geo_lon=lon,
        )
        session.add(station)
        existing_names.add(name.lower())

        status = "imported" if district_id else "unmapped"
        if not district_id:
            unmapped += 1
        imported += 1

        details.append({
            "name": name,
            "status": status,
            "line_name": station_data.get("line_name"),
            "line_color": station_data.get("line_color"),
            "district_id": district_id,
        })

    await session.commit()
    await cache.invalidate_metro()

    logger.info(
        "Metro import completed",
        city=city.name,
        imported=imported,
        skipped=skipped,
        unmapped=unmapped,
    )

    return {
        "imported": imported,
        "skipped": skipped,
        "unmapped": unmapped,
        "details": details,
    }


# ── Helpers ──────────────────────────────────────────────────────

def _metro_to_dict(station: Metro) -> dict:
    return {
        "id": station.id,
        "name": station.name,
        "district_id": station.district_id,
        "city_id": station.city_id,
        "line_color": station.line_color,
        "line_name": station.line_name,
        "geo_lat": station.geo_lat,
        "geo_lon": station.geo_lon,
    }
