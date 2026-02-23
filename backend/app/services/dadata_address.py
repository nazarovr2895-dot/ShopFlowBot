"""DaData address autocomplete and geocoding for Russian addresses."""
import httpx
from typing import List, Dict, Any, Optional
from backend.app.core.settings import get_settings
from backend.app.core.logging import get_logger

logger = get_logger(__name__)

DADATA_SUGGEST_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address"

# DaData returns full district names; our DB stores abbreviations.
# Map full names → abbreviations for Moscow administrative okrugs.
_DISTRICT_FULL_TO_ABBR: Dict[str, str] = {
    "Центральный": "ЦАО",
    "Северный": "САО",
    "Северо-Восточный": "СВАО",
    "Восточный": "ВАО",
    "Юго-Восточный": "ЮВАО",
    "Южный": "ЮАО",
    "Юго-Западный": "ЮЗАО",
    "Западный": "ЗАО",
    "Северо-Западный": "СЗАО",
}


def _normalize_district_name(city_district: Optional[str], city_district_type: Optional[str] = None) -> Optional[str]:
    """Convert DaData city_district to DB district name (abbreviation or known name)."""
    if not city_district:
        return None
    # If DaData returns full name like "Центральный", map to abbreviation
    if city_district in _DISTRICT_FULL_TO_ABBR:
        return _DISTRICT_FULL_TO_ABBR[city_district]
    # If it's already an abbreviation (ЦАО, САО, etc.) or a known outer district name
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
        city_district_raw = d.get("city_district")
        city_district_type = d.get("city_district_type")
        district_name = _normalize_district_name(city_district_raw, city_district_type)
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

    logger.info(
        "DaData district resolve",
        address=address[:80],
        city_district=city_district,
        city_district_type=city_district_type,
    )

    return _normalize_district_name(city_district, city_district_type)
