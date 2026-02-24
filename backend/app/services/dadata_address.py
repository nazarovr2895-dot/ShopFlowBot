"""DaData address autocomplete and geocoding for Russian addresses."""
import asyncio
import httpx
from typing import List, Dict, Any, Optional
from backend.app.core.settings import get_settings
from backend.app.core.logging import get_logger

logger = get_logger(__name__)

DADATA_SUGGEST_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address"
DADATA_METRO_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/metro"
DADATA_GEOLOCATE_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/geolocate/address"


def _normalize_district_name(
    city_district: Optional[str],
    city_district_type: Optional[str] = None,
    okato: Optional[str] = None,
) -> Optional[str]:
    """Return district name as-is. No abbreviation mapping needed.

    All cities (including Moscow) now store actual district/rayon names
    from DaData's city_district field (e.g. "Тверской", "Арбат").
    """
    if not city_district:
        return None
    return city_district


async def _call_dadata(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Low-level DaData suggest call. Returns raw suggestions list."""
    settings = get_settings()
    if not settings.DADATA_API_KEY:
        logger.warning("DADATA_API_KEY not configured")
        return []

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Token {settings.DADATA_API_KEY}",
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(DADATA_SUGGEST_URL, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        return data.get("suggestions", [])
    except httpx.HTTPStatusError as e:
        logger.error(f"DaData API error: {e.response.status_code}")
        return []
    except httpx.TimeoutException:
        logger.error("DaData API timeout")
        return []
    except Exception as e:
        logger.error(f"DaData API unexpected error: {e}", exc_info=e)
        return []


async def suggest_address(
    query: str,
    count: int = 5,
    city_kladr_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Address autocomplete suggestions via DaData API.

    Args:
        query: Address search string (e.g. "Москва Тверская")
        count: Max number of suggestions (default 5)
        city_kladr_id: Optional KLADR ID to filter by city (e.g. "7700000000000" for Moscow)

    Returns:
        List of dicts: [{value, lat, lon, city, city_district, ...}]
    """
    payload: Dict[str, Any] = {"query": query, "count": count}
    if city_kladr_id:
        payload["locations"] = [{"kladr_id": city_kladr_id}]

    suggestions = await _call_dadata(payload)
    result = []
    for s in suggestions:
        d = s.get("data", {})
        # Prefer city_district (rayon) — more granular than city_area (okrug).
        # city_district may be null in multi-result queries — that's OK for autocomplete.
        city_area = d.get("city_area")
        city_district_raw = d.get("city_district")
        city_district_type = d.get("city_district_type")
        okato = d.get("okato")
        district_name = None
        if city_district_raw:
            district_name = _normalize_district_name(city_district_raw, city_district_type, okato=okato)
        if not district_name and city_area:
            district_name = _normalize_district_name(city_area, okato=okato)
        result.append({
            "value": s.get("value", ""),
            "lat": d.get("geo_lat"),
            "lon": d.get("geo_lon"),
            "city": d.get("city"),
            "city_district": district_name,
            "area": d.get("area"),
            "region": d.get("region"),
            "postal_code": d.get("postal_code"),
        })
    return result


async def resolve_district_from_address(address: str) -> Optional[str]:
    """
    Resolve district/rayon name from a full address string.
    Makes a DaData call with count=1 to get detailed address data
    (DaData populates city_district only for focused single-result queries).
    Returns district name as stored in DB (e.g. "Тверской", "Арбат") or None.
    """
    if not address or len(address) < 5:
        return None

    suggestions = await _call_dadata({"query": address, "count": 1})
    if not suggestions:
        return None

    d = suggestions[0].get("data", {})
    city_district = d.get("city_district")
    city_district_type = d.get("city_district_type")
    city_area = d.get("city_area")
    area = d.get("area")
    okato = d.get("okato")
    settlement = d.get("settlement")
    settlement_type = d.get("settlement_type")

    logger.info(
        "DaData district resolve",
        address=address[:80],
        city_district=city_district,
        city_district_type=city_district_type,
        city_area=city_area,
        area=area,
        okato=okato,
        settlement=settlement,
        settlement_type=settlement_type,
    )

    # Prefer city_district (rayon) — more granular for delivery zones
    if city_district:
        normalized = _normalize_district_name(city_district, city_district_type, okato=okato)
        if normalized:
            return normalized

    # Fallback: city_area (useful for non-Moscow cities or when city_district is empty)
    if city_area:
        normalized = _normalize_district_name(city_area, okato=okato)
        if normalized:
            return normalized

    return None


def _normalize_color(color: Optional[str]) -> Optional[str]:
    """Normalize DaData color (RGB hex without #) to #RRGGBB format."""
    if not color:
        return None
    color = color.strip()
    if not color.startswith("#"):
        color = f"#{color}"
    return color[:7]


def _safe_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


async def _call_dadata_url(url: str, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Low-level DaData suggest call to arbitrary URL. Returns raw suggestions list."""
    settings = get_settings()
    if not settings.DADATA_API_KEY:
        logger.warning("DADATA_API_KEY not configured")
        return []

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Token {settings.DADATA_API_KEY}",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        return data.get("suggestions", [])
    except httpx.HTTPStatusError as e:
        logger.error(f"DaData API error: {e.response.status_code}", url=url)
        return []
    except httpx.TimeoutException:
        logger.error("DaData API timeout", url=url)
        return []
    except Exception as e:
        logger.error(f"DaData API unexpected error: {e}", url=url, exc_info=e)
        return []


async def suggest_city(query: str, count: int = 10) -> List[Dict[str, Any]]:
    """City autocomplete via DaData. Returns [{name, kladr_id, region}]."""
    payload = {
        "query": query,
        "count": count,
        "from_bound": {"value": "city"},
        "to_bound": {"value": "city"},
    }
    suggestions = await _call_dadata(payload)
    result = []
    seen = set()
    for s in suggestions:
        d = s.get("data", {})
        name = d.get("city") or ""
        kladr_id = d.get("city_kladr_id") or d.get("kladr_id") or ""
        if not name or kladr_id in seen:
            continue
        seen.add(kladr_id)
        result.append({
            "name": name,
            "kladr_id": kladr_id,
            "region": d.get("region_with_type") or d.get("region"),
        })
    return result


async def suggest_district(query: str, city_kladr_id: str, count: int = 10) -> List[str]:
    """
    Suggest district/rayon names for a city via DaData.
    Queries addresses within the city and extracts unique city_district values.
    Returns list of district names (e.g. ["Тверской", "Арбат", "Басманный"]).
    """
    payload: Dict[str, Any] = {
        "query": query,
        "count": 20,
        "locations": [{"kladr_id": city_kladr_id}],
    }
    suggestions = await _call_dadata(payload)
    seen: set[str] = set()
    result: List[str] = []
    for s in suggestions:
        d = s.get("data", {})
        # Prefer city_district (rayon), fallback to city_area
        raw = d.get("city_district") or d.get("city_area")
        if not raw:
            continue
        normalized = _normalize_district_name(raw, okato=d.get("okato"))
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(normalized)
        if len(result) >= count:
            break
    return result


async def fetch_city_districts(city_kladr_id: str) -> List[str]:
    """
    Fetch all district/rayon names for a city from DaData.
    Queries addresses with various search terms and collects unique districts.
    Returns district names (e.g. ["Арбат", "Тверской", "Басманный"] for Moscow).
    """
    seen: set[str] = set()
    result: List[str] = []

    # Use varied search terms to maximize coverage of all districts
    queries = ["район", "ул", "пр", "а", "б", "в", "г", "д", "е", "к", "л", "м", "н", "о", "п", "р", "с", "т"]

    for q in queries:
        payload: Dict[str, Any] = {
            "query": q,
            "count": 20,
            "locations": [{"kladr_id": city_kladr_id}],
        }
        suggestions = await _call_dadata(payload)
        for s in suggestions:
            d = s.get("data", {})
            # Unified logic: prefer city_district (rayon), fallback to city_area
            raw = d.get("city_district") or d.get("city_area")

            if not raw:
                continue
            normalized = _normalize_district_name(raw, okato=d.get("okato"))
            if not normalized:
                continue
            key = normalized.lower()
            if key not in seen:
                seen.add(key)
                result.append(normalized)

        await asyncio.sleep(0.05)

    return sorted(result)


async def fetch_metro_stations(city_kladr_id: str) -> List[Dict[str, Any]]:
    """
    Fetch all metro stations for a city from DaData /suggest/metro.
    DaData returns max 20 per request, so we iterate through Cyrillic alphabet.
    Returns [{name, line_name, line_color, geo_lat, geo_lon, is_closed}].
    """
    all_stations: Dict[str, Dict[str, Any]] = {}

    # Iterate through Cyrillic letters + empty query to maximize coverage
    queries = [""] + [chr(c) for c in range(ord("\u0430"), ord("\u044f") + 1)]

    for q in queries:
        payload = {
            "query": q,
            "filters": [{"city_kladr_id": city_kladr_id}],
            "count": 20,
        }
        suggestions = await _call_dadata_url(DADATA_METRO_URL, payload)
        for s in suggestions:
            d = s.get("data", {})
            name = d.get("name") or s.get("value", "")
            if not name or name in all_stations:
                continue
            all_stations[name] = {
                "name": name,
                "line_name": d.get("line_name"),
                "line_color": _normalize_color(d.get("color")),
                "geo_lat": _safe_float(d.get("geo_lat")),
                "geo_lon": _safe_float(d.get("geo_lon")),
                "is_closed": d.get("is_closed", False),
            }
        # Small delay to avoid rate limiting (30 req/sec)
        await asyncio.sleep(0.05)

    return list(all_stations.values())


async def resolve_district_from_coordinates(lat: float, lon: float) -> Optional[str]:
    """
    Resolve district/rayon name from coordinates using DaData geolocate API.
    Falls back to suggest with the nearest address if geolocate doesn't return a district.
    Returns district name (e.g. "Тверской", "Арбат") or None.
    """
    # Use geolocate endpoint with multiple results — sometimes only addresses with
    # house numbers have city_district filled in
    payload = {"lat": lat, "lon": lon, "count": 5}
    suggestions = await _call_dadata_url(DADATA_GEOLOCATE_URL, payload)
    if not suggestions:
        return None

    # Check all geolocate results for district info
    for s in suggestions:
        d = s.get("data", {})

        # Prefer city_district (rayon) — more granular
        city_district = d.get("city_district")
        if city_district:
            normalized = _normalize_district_name(city_district, d.get("city_district_type"))
            if normalized:
                return normalized

        # Fallback: city_area
        city_area = d.get("city_area")
        if city_area:
            normalized = _normalize_district_name(city_area)
            if normalized:
                return normalized

    # Fallback: find the first result with a house number and resolve via suggest
    # (suggest with a specific address often fills in city_district when geolocate doesn't)
    for s in suggestions:
        d = s.get("data", {})
        if d.get("house"):
            address_value = s.get("value")
            if address_value:
                return await resolve_district_from_address(address_value)

    return None
