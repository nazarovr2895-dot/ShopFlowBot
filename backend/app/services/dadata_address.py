"""DaData address autocomplete and geocoding for Russian addresses."""
import httpx
from typing import List, Dict, Any, Optional
from backend.app.core.settings import get_settings
from backend.app.core.logging import get_logger

logger = get_logger(__name__)

DADATA_SUGGEST_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address"


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
        List of dicts: [{value, lat, lon, city, city_district, district_id_hint}]
    """
    settings = get_settings()
    if not settings.DADATA_API_KEY:
        logger.warning("DADATA_API_KEY not configured, skipping address suggest")
        return []

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Token {settings.DADATA_API_KEY}",
    }

    payload: Dict[str, Any] = {"query": query, "count": count}
    if city_kladr_id:
        payload["locations"] = [{"kladr_id": city_kladr_id}]

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(DADATA_SUGGEST_URL, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()

        suggestions = data.get("suggestions", [])
        result = []
        for s in suggestions:
            d = s.get("data", {})
            result.append({
                "value": s.get("value", ""),
                "lat": d.get("geo_lat"),
                "lon": d.get("geo_lon"),
                "city": d.get("city"),
                "city_district": d.get("city_district"),  # e.g. "ЦАО"
                "area": d.get("area"),  # e.g. "Тверской"
                "region": d.get("region"),
                "postal_code": d.get("postal_code"),
            })
        return result

    except httpx.HTTPStatusError as e:
        logger.error(f"DaData address suggest error: {e.response.status_code}")
        return []
    except httpx.TimeoutException:
        logger.error("DaData address suggest timeout")
        return []
    except Exception as e:
        logger.error(f"DaData address suggest unexpected error: {e}", exc_info=e)
        return []
