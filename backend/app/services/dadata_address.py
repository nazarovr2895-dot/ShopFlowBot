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

# DaData returns full district names (city_area); our DB stores abbreviations.
# Map lowercase full names → abbreviations for Moscow administrative okrugs.
# DaData may use mixed case (e.g. "Северо-восточный"), so we compare lowercase.
_DISTRICT_FULL_TO_ABBR: Dict[str, str] = {
    "центральный": "ЦАО",
    "северный": "САО",
    "северо-восточный": "СВАО",
    "восточный": "ВАО",
    "юго-восточный": "ЮВАО",
    "южный": "ЮАО",
    "юго-западный": "ЮЗАО",
    "западный": "ЗАО",
    "северо-западный": "СЗАО",
}


# Moscow OKATO 3-digit codes → administrative okrug name (as stored in DB)
_OKATO_PREFIX_TO_DISTRICT: Dict[str, str] = {
    "45286": "ЦАО",
    "45280": "САО",
    "45281": "СВАО",
    "45283": "ВАО",
    "45285": "ЮВАО",
    "45284": "ЮАО",
    "45293": "ЮЗАО",
    "45263": "ЗАО",
    "45277": "СЗАО",
    "45272": "Зеленоградский",
    "45298": "Новомосковский",
    "45297": "Троицкий",
}


def _normalize_district_name(city_district: Optional[str], city_district_type: Optional[str] = None) -> Optional[str]:
    """Convert DaData city_area/city_district to DB district name (abbreviation or known name)."""
    if not city_district:
        return None
    # Case-insensitive lookup: DaData may return "Северо-восточный" or "Северо-Восточный"
    lower = city_district.lower()
    if lower in _DISTRICT_FULL_TO_ABBR:
        return _DISTRICT_FULL_TO_ABBR[lower]
    # If it's already an abbreviation (ЦАО, САО, etc.) or a known outer district name
    return city_district


def _okato_to_district(okato: str) -> Optional[str]:
    """Resolve Moscow administrative okrug from OKATO code (first 5 digits)."""
    if not okato or len(okato) < 5:
        return None
    prefix = okato[:5]
    return _OKATO_PREFIX_TO_DISTRICT.get(prefix)


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
        # Try city_area first (contains okrug for Moscow even in multi-result),
        # then city_district, then OKATO — same priority as resolve_district_from_address()
        city_area = d.get("city_area")
        city_district_raw = d.get("city_district")
        city_district_type = d.get("city_district_type")
        district_name = None
        if city_area:
            district_name = _normalize_district_name(city_area)
        if not district_name:
            district_name = _normalize_district_name(city_district_raw, city_district_type)
        if not district_name:
            okato = d.get("okato")
            if okato:
                district_name = _okato_to_district(okato)
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
    Resolve Moscow district name from a full address string.
    Makes a DaData call with count=1 to get detailed address data
    (DaData populates city_district only for focused single-result queries).
    Returns normalized district name as stored in DB (e.g. "ЦАО") or None.
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

    # Try city_area first (may contain okrug for Moscow)
    if city_area:
        normalized = _normalize_district_name(city_area)
        if normalized:
            return normalized

    # Then try city_district
    normalized = _normalize_district_name(city_district, city_district_type)
    if normalized:
        return normalized

    # Try OKATO-based resolution as fallback
    if okato:
        okato_district = _okato_to_district(okato)
        if okato_district:
            return okato_district

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
    Suggest district names for a city via DaData.
    Queries addresses within the city and extracts unique city_area values.
    Returns list of normalized district names (e.g. ["ЦАО", "САО", "СВАО"]).
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
        # Try city_area first (okrugs for Moscow, районы for SPb), then city_district
        raw = d.get("city_area") or d.get("city_district")
        if not raw:
            continue
        normalized = _normalize_district_name(raw)
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
    Resolve district name from coordinates using DaData geolocate API.
    Falls back to suggest with the nearest address if geolocate doesn't return a district.
    Returns normalized district name as stored in DB (e.g. "ЦАО", "Ленинский") or None.
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

        # Try city_area first (Moscow okrugs)
        city_area = d.get("city_area")
        if city_area:
            normalized = _normalize_district_name(city_area)
            if normalized:
                return normalized

        # Then city_district (works for most cities)
        city_district = d.get("city_district")
        normalized = _normalize_district_name(city_district, d.get("city_district_type"))
        if normalized:
            return normalized

    # OKATO fallback from first result (Moscow only)
    okato = suggestions[0].get("data", {}).get("okato")
    if okato:
        okato_district = _okato_to_district(okato)
        if okato_district:
            return okato_district

    # Fallback: find the first result with a house number and resolve via suggest
    # (suggest with a specific address often fills in city_district when geolocate doesn't)
    for s in suggestions:
        d = s.get("data", {})
        if d.get("house"):
            address_value = s.get("value")
            if address_value:
                return await resolve_district_from_address(address_value)

    return None
