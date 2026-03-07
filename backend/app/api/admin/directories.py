"""СПРАВОЧНИКИ (ГОРОДА, РАЙОНЫ) — city, district, address, INN/org endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from backend.app.api.deps import get_session
from backend.app.services.sellers import SellerService
from backend.app.services.dadata import validate_inn
from backend.app.api.admin._common import (
    require_admin_token,
    _extract_fio,
    logger,
)

router = APIRouter()


@router.get("/cities")
async def get_cities(session: AsyncSession = Depends(get_session)):
    """Получить список городов"""
    service = SellerService(session)
    return await service.get_cities()


@router.get("/districts/{city_id}")
async def get_districts(city_id: int, session: AsyncSession = Depends(get_session)):
    """Получить список районов по городу"""
    service = SellerService(session)
    return await service.get_districts(city_id)


@router.get("/address/suggest")
async def admin_suggest_address(
    q: str = Query(..., min_length=2),
    city_kladr_id: Optional[str] = Query(None),
    _token: None = Depends(require_admin_token),
):
    """DaData address autocomplete for admin panel."""
    from backend.app.services.dadata_address import suggest_address
    return await suggest_address(q, count=5, city_kladr_id=city_kladr_id)


@router.get("/address/check-coverage")
async def admin_check_address_coverage(
    address: str = Query(..., min_length=3),
    city_id: int = Query(...),
    session: AsyncSession = Depends(get_session),
    _token: None = Depends(require_admin_token),
):
    """Check if address is within coverage (district exists for this city)."""
    from backend.app.services.dadata_address import resolve_district_from_address
    from backend.app.models.seller import District

    district_name = await resolve_district_from_address(address)
    if not district_name:
        return {"covered": False, "district_id": None, "district_name": None}

    result = await session.execute(
        select(District).where(
            District.city_id == city_id,
            func.lower(District.name) == district_name.lower(),
        )
    )
    district = result.scalar_one_or_none()
    if district:
        return {"covered": True, "district_id": district.id, "district_name": district.name}
    return {"covered": False, "district_id": None, "district_name": district_name}


@router.get("/inn/{inn}")
async def get_inn_data(inn: str, _token: None = Depends(require_admin_token)):
    """Получить данные организации по ИНН из DaData API"""
    try:
        org_data = await validate_inn(inn)
        if org_data is None:
            raise HTTPException(status_code=404, detail="Организация с таким ИНН не найдена")

        # Extract OKVED codes
        okved = org_data.get("okved")
        okveds = org_data.get("okveds")  # Array of additional OKVED codes
        okved_type = org_data.get("okved_type")

        # Extract registration date (timestamp in milliseconds)
        state = org_data.get("state", {})
        registration_timestamp = state.get("registration_date")
        registration_date = None
        if registration_timestamp:
            # Convert milliseconds to datetime, then to ISO string
            from datetime import datetime
            registration_date = datetime.fromtimestamp(registration_timestamp / 1000).isoformat()

        # Compare OKVED with target codes (47.76 and 47.91)
        def check_okved_match(code: str, target_codes: list[str]) -> bool:
            """Check if OKVED code matches any target code (exact or starts with)"""
            if not code:
                return False
            for target in target_codes:
                if code == target or code.startswith(target + "."):
                    return True
            return False

        matches_47_76 = False
        matches_47_91 = False

        if okved:
            matches_47_76 = check_okved_match(okved, ["47.76"])
            matches_47_91 = check_okved_match(okved, ["47.91"])

        # Check additional OKVED codes
        if okveds and isinstance(okveds, list):
            for additional_okved in okveds:
                if isinstance(additional_okved, str):
                    if not matches_47_76:
                        matches_47_76 = check_okved_match(additional_okved, ["47.76"])
                    if not matches_47_91:
                        matches_47_91 = check_okved_match(additional_okved, ["47.91"])

        # Extract relevant fields from DaData response
        result = {
            "inn": org_data.get("inn"),
            "kpp": org_data.get("kpp"),
            "ogrn": org_data.get("ogrn"),
            "name": org_data.get("name", {}).get("full_with_opf") or org_data.get("name", {}).get("short_with_opf") or org_data.get("name", {}).get("full") or "",
            "short_name": org_data.get("name", {}).get("short") or "",
            "type": org_data.get("type"),  # LEGAL or INDIVIDUAL
            "address": org_data.get("address", {}).get("value") or "",
            "management": _extract_fio(org_data),
            "state": {
                "status": state.get("status"),
                "actuality_date": state.get("actuality_date"),
            },
            "okved": okved,
            "okveds": okveds if okveds else None,
            "okved_type": okved_type,
            "registration_date": registration_date,
            "okved_match": {
                "matches_47_76": matches_47_76,
                "matches_47_91": matches_47_91,
                "main_okved": okved or "",
            }
        }
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching INN data: {e}", exc_info=e)
        raise HTTPException(status_code=500, detail=f"Ошибка при получении данных ИНН: {str(e)}")


@router.get("/org/{identifier}")
async def get_org_data(identifier: str, _token: None = Depends(require_admin_token)):
    """Получить данные организации по ИНН или ОГРН из DaData API"""
    try:
        org_data = await validate_inn(identifier)
        if org_data is None:
            raise HTTPException(status_code=404, detail="Организация с таким идентификатором не найдена")

        okved = org_data.get("okved")
        okveds = org_data.get("okveds")
        okved_type = org_data.get("okved_type")

        state = org_data.get("state", {})
        registration_timestamp = state.get("registration_date")
        registration_date = None
        if registration_timestamp:
            from datetime import datetime as dt
            registration_date = dt.fromtimestamp(registration_timestamp / 1000).isoformat()

        def check_okved_match(code: str, target_codes: list[str]) -> bool:
            if not code:
                return False
            for target in target_codes:
                if code == target or code.startswith(target + "."):
                    return True
            return False

        matches_47_76 = False
        matches_47_91 = False

        if okved:
            matches_47_76 = check_okved_match(okved, ["47.76"])
            matches_47_91 = check_okved_match(okved, ["47.91"])

        if okveds and isinstance(okveds, list):
            for additional_okved in okveds:
                if isinstance(additional_okved, str):
                    if not matches_47_76:
                        matches_47_76 = check_okved_match(additional_okved, ["47.76"])
                    if not matches_47_91:
                        matches_47_91 = check_okved_match(additional_okved, ["47.91"])

        result = {
            "inn": org_data.get("inn"),
            "kpp": org_data.get("kpp"),
            "ogrn": org_data.get("ogrn"),
            "name": org_data.get("name", {}).get("full_with_opf") or org_data.get("name", {}).get("short_with_opf") or org_data.get("name", {}).get("full") or "",
            "short_name": org_data.get("name", {}).get("short") or "",
            "type": org_data.get("type"),
            "address": org_data.get("address", {}).get("value") or "",
            "management": _extract_fio(org_data),
            "state": {
                "status": state.get("status"),
                "actuality_date": state.get("actuality_date"),
            },
            "okved": okved,
            "okveds": okveds if okveds else None,
            "okved_type": okved_type,
            "registration_date": registration_date,
            "okved_match": {
                "matches_47_76": matches_47_76,
                "matches_47_91": matches_47_91,
                "main_okved": okved or "",
            }
        }
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching org data: {e}", exc_info=e)
        raise HTTPException(status_code=500, detail=f"Ошибка при получении данных организации: {str(e)}")
