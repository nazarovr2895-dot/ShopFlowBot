"""
DaData service for INN validation.
"""
import httpx
from typing import Optional, Dict, Any
from backend.app.core.settings import get_settings
from backend.app.core.logging import get_logger

logger = get_logger(__name__)

DADATA_API_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party"


async def validate_inn(inn: str) -> Optional[Dict[str, Any]]:
    """
    Validate organization by INN or OGRN using DaData API.

    Args:
        inn: INN (10/12 digits) or OGRN (13/15 digits) string

    Returns:
        Organization data dict if found and valid, None otherwise

    Raises:
        Exception: On network errors or API errors
    """
    settings = get_settings()

    if not settings.DADATA_API_KEY:
        logger.warning("DADATA_API_KEY not configured, skipping validation")
        return None

    # Validate format: INN (10/12 digits) or OGRN (13/15 digits)
    inn_clean = inn.strip()
    if not inn_clean.isdigit() or len(inn_clean) not in (10, 12, 13, 15):
        raise ValueError("Идентификатор должен быть ИНН (10/12 цифр) или ОГРН (13/15 цифр)")
    
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Token {settings.DADATA_API_KEY}",
    }
    
    payload = {"query": inn_clean}
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                DADATA_API_URL,
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()
            
            # Check if organization found
            suggestions = data.get("suggestions", [])
            if not suggestions:
                logger.info(f"INN not found in DaData: {inn_clean}")
                return None
            
            org_data = suggestions[0].get("data", {})
            
            # Validate organization status
            state = org_data.get("state", {})
            status = state.get("status")
            
            if status != "ACTIVE":
                logger.warning(
                    f"Organization with INN {inn_clean} is not active: status={status}"
                )
                raise ValueError(f"Организация неактивна или ликвидирована (статус: {status})")
            
            # Validate organization type
            org_type = org_data.get("type")
            if org_type not in ("LEGAL", "INDIVIDUAL"):
                logger.warning(
                    f"Organization with INN {inn_clean} has invalid type: {org_type}"
                )
                raise ValueError(f"Неверный тип организации: {org_type}")
            
            logger.info(f"INN validated successfully: {inn_clean}, type={org_type}, status={status}")
            return org_data
            
    except httpx.HTTPStatusError as e:
        logger.error(f"DaData API error: {e.response.status_code} - {e.response.text}")
        if e.response.status_code == 401:
            raise ValueError("Неверный API ключ DaData")
        elif e.response.status_code == 429:
            raise ValueError("Превышен лимит запросов к DaData API. Попробуйте позже.")
        else:
            raise ValueError(f"Ошибка при проверке ИНН через DaData API: {e.response.status_code}")
    except httpx.TimeoutException:
        logger.error("DaData API timeout")
        raise ValueError("Таймаут при проверке ИНН. Попробуйте позже.")
    except httpx.RequestError as e:
        logger.error(f"DaData API request error: {e}")
        raise ValueError("Ошибка сети при проверке ИНН. Попробуйте позже.")
    except Exception as e:
        logger.error(f"Unexpected error validating INN: {e}", exc_info=e)
        raise
