import os
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel, field_validator, model_validator

from backend.app.api.deps import get_session, get_cache
from backend.app.core.logging import get_logger
from backend.app.core.password_utils import hash_password
from backend.app.services.sellers import (
    SellerService,
    SellerServiceError,
    SellerNotFoundError,
)
from backend.app.services.orders import OrderService
from backend.app.services.cache import CacheService
from backend.app.services.dadata import validate_inn

router = APIRouter()
logger = get_logger(__name__)

# Admin panel auth: when ADMIN_SECRET is set, require X-Admin-Token header
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "")


async def require_admin_token(x_admin_token: Optional[str] = Header(None, alias="X-Admin-Token")):
    """Require admin token. If ADMIN_SECRET is not configured, reject all requests (fail-closed)."""
    if not ADMIN_SECRET:
        logger.warning("ADMIN_SECRET not configured — admin endpoints are blocked")
        raise HTTPException(status_code=503, detail="Admin panel not configured (ADMIN_SECRET missing)")
    if not x_admin_token or x_admin_token != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Invalid or missing admin token")


def _handle_seller_error(e: SellerServiceError):
    """Convert seller service exceptions to HTTP exceptions."""
    raise HTTPException(status_code=e.status_code, detail=e.message)


def _extract_fio(org_data: dict) -> Optional[str]:
    """Extract person name from DaData org data. Works for both LEGAL (management) and INDIVIDUAL (fio)."""
    # For LEGAL entities: management.name
    mgmt = org_data.get("management")
    if mgmt and mgmt.get("name"):
        return mgmt["name"]
    # For INDIVIDUAL (ИП): fio object with surname/name/patronymic
    fio = org_data.get("fio")
    if fio:
        parts = [fio.get("surname"), fio.get("name"), fio.get("patronymic")]
        full = " ".join(p for p in parts if p)
        if full:
            return full
    return None


# ============================================
# SCHEMAS
# ============================================

class SellerCreateSchema(BaseModel):
    tg_id: int
    fio: str
    phone: str
    shop_name: Optional[str] = None
    inn: Optional[str] = None
    ogrn: Optional[str] = None
    description: Optional[str] = None
    city_id: Optional[int] = None
    district_id: Optional[int] = None
    address_name: Optional[str] = None
    map_url: Optional[str] = None
    metro_id: Optional[int] = None
    metro_walk_minutes: Optional[int] = None
    delivery_type: Optional[str] = None
    placement_expired_at: Optional[datetime] = None
    commission_percent: Optional[int] = None
    max_branches: Optional[int] = None
    auto_create_delivery_zone: bool = False

    @model_validator(mode='after')
    def validate_regular_seller_fields(self):
        """Regular sellers (no branches) require shop_name and delivery_type."""
        if self.max_branches is None:
            if not self.shop_name:
                raise ValueError('Название магазина обязательно для обычного продавца')
            if not self.delivery_type:
                raise ValueError('Тип доставки обязателен для обычного продавца')
        return self

    @field_validator('max_branches')
    @classmethod
    def validate_max_branches(cls, v):
        if v is not None and v < 1:
            raise ValueError('Макс. филиалов должно быть >= 1')
        return v

    @field_validator('commission_percent')
    @classmethod
    def validate_commission(cls, v):
        if v is not None and (v < 0 or v > 100):
            raise ValueError('Комиссия должна быть от 0 до 100%')
        return v

    @field_validator('inn')
    @classmethod
    def validate_inn_format(cls, v):
        """Validate INN format: must be 10 or 12 digits."""
        if v is None or v == '':
            return None
        v_clean = v.strip()
        if not v_clean.isdigit():
            raise ValueError('ИНН должен содержать только цифры')
        if len(v_clean) not in (10, 12):
            raise ValueError('ИНН должен содержать 10 цифр (для юрлиц) или 12 цифр (для ИП)')
        return v_clean

    @field_validator('ogrn')
    @classmethod
    def validate_ogrn_format(cls, v):
        """Validate OGRN format: must be 13 or 15 digits."""
        if v is None or v == '':
            return None
        v_clean = v.strip()
        if not v_clean.isdigit():
            raise ValueError('ОГРН должен содержать только цифры')
        if len(v_clean) not in (13, 15):
            raise ValueError('ОГРН должен содержать 13 цифр (для юрлиц) или 15 цифр (для ИП)')
        return v_clean

    @field_validator('fio')
    @classmethod
    def validate_fio(cls, v):
        """Validate FIO length."""
        if len(v.strip()) < 2:
            raise ValueError('ФИО должно быть не менее 2 символов')
        if len(v.strip()) > 200:
            raise ValueError('ФИО не может быть длиннее 200 символов')
        return v.strip()

    @field_validator('shop_name')
    @classmethod
    def validate_shop_name(cls, v):
        """Validate shop name length (optional for network sellers)."""
        if v is None:
            return v
        if len(v.strip()) < 2:
            raise ValueError('Название не менее 2 символов')
        if len(v.strip()) > 255:
            raise ValueError('Название не более 255 символов')
        return v.strip()
    
    @field_validator('placement_expired_at', mode='before')
    @classmethod
    def parse_placement_expired_at(cls, v):
        """Parse date string in YYYY-MM-DD format to datetime without timezone (database column is TIMESTAMP WITHOUT TIME ZONE)."""
        if v is None or v == '':
            return None
        if isinstance(v, datetime):
            # Remove timezone if present (database column is TIMESTAMP WITHOUT TIME ZONE)
            if v.tzinfo is not None:
                # Convert to UTC first, then remove timezone
                return v.astimezone(timezone.utc).replace(tzinfo=None)
            return v
        if isinstance(v, str):
            # Handle YYYY-MM-DD format
            if '-' in v:
                try:
                    dt = datetime.strptime(v[:10], "%Y-%m-%d")
                    return dt  # Return naive datetime (no timezone)
                except ValueError:
                    pass
            # Handle DD.MM.YYYY format
            if '.' in v:
                try:
                    parts = v.split('.')
                    if len(parts) == 3:
                        d, m, y = int(parts[0]), int(parts[1]), int(parts[2])
                        dt = datetime(y, m, d)
                        return dt  # Return naive datetime (no timezone)
                except (ValueError, IndexError):
                    pass
        return v


class SellerUpdateSchema(BaseModel):
    field: str
    value: str


class SellerStatsResponse(BaseModel):
    fio: str
    orders_count: int
    total_sales: float
    platform_profit: float


# ============================================
# СПРАВОЧНИКИ (ГОРОДА, РАЙОНЫ)
# ============================================

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


# ============================================
# УПРАВЛЕНИЕ ПРОДАВЦАМИ
# ============================================

@router.post("/create_seller")
async def create_seller_api(data: SellerCreateSchema, session: AsyncSession = Depends(get_session), _token: None = Depends(require_admin_token)):
    """Создать продавца с полными данными. Автоматически генерирует ID, логин и пароль для веб-панели."""
    try:
        logger.info(
            "Creating seller",
            tg_id=data.tg_id,
            shop_name=data.shop_name,
            city_id=data.city_id,
        )
        service = SellerService(session)
        result = await service.create_seller(
            tg_id=data.tg_id,
            fio=data.fio,
            phone=data.phone,
            shop_name=data.shop_name,
            inn=data.inn,
            ogrn=data.ogrn,
            description=data.description,
            city_id=data.city_id,
            district_id=data.district_id,
            address_name=data.address_name,
            map_url=data.map_url,
            metro_id=data.metro_id,
            metro_walk_minutes=data.metro_walk_minutes,
            delivery_type=data.delivery_type,
            placement_expired_at=data.placement_expired_at,
            commission_percent=data.commission_percent,
            max_branches=data.max_branches,
        )
        created_tg_id = result.get("tg_id") or data.tg_id
        logger.info("Seller created", tg_id=created_tg_id, shop_name=data.shop_name)

        # Auto-create delivery zone if requested and district is set
        if data.auto_create_delivery_zone and data.district_id and result.get("status") == "ok":
            try:
                from backend.app.services.delivery_zones import DeliveryZoneService
                from backend.app.models.seller import District, Seller

                district = await session.get(District, data.district_id)
                zone_name = district.name if district else "Зона доставки"

                zone_svc = DeliveryZoneService(session)
                await zone_svc.create_zone(created_tg_id, {
                    "name": zone_name,
                    "district_ids": [data.district_id],
                    "delivery_price": 0,
                    "is_active": True,
                    "priority": 0,
                })

                seller = await session.get(Seller, created_tg_id)
                if seller:
                    seller.use_delivery_zones = True

                await session.commit()
                result["delivery_zone_created"] = True
                logger.info("Auto-created delivery zone", tg_id=created_tg_id, district=zone_name)
            except Exception as e:
                logger.error("Failed to auto-create delivery zone", exc_info=e)
                result["delivery_zone_created"] = False

        return result
    except SellerServiceError as e:
        _handle_seller_error(e)
    except Exception as e:
        logger.error("Unexpected error creating seller", exc_info=e)
        raise HTTPException(status_code=500, detail=f"Ошибка при создании продавца: {str(e)}")


@router.get("/sellers/search")
async def search_sellers(
    fio: str,
    include_deleted: bool = False,
    session: AsyncSession = Depends(get_session)
):
    """Поиск продавцов по ФИО. По умолчанию не включает soft-deleted."""
    service = SellerService(session)
    return await service.search(fio, include_deleted)


@router.get("/sellers/all")
async def list_all_sellers(
    include_deleted: bool = False,
    session: AsyncSession = Depends(get_session)
):
    """Список всех продавцов. По умолчанию не включает soft-deleted."""
    service = SellerService(session)
    return await service.list_all(include_deleted)


@router.put("/sellers/{tg_id}/update")
async def update_seller_field(
    tg_id: int,
    data: SellerUpdateSchema,
    session: AsyncSession = Depends(get_session)
):
    """Обновить поле продавца"""
    service = SellerService(session)
    
    try:
        return await service.update_field(tg_id, data.field, data.value)
    except SellerServiceError as e:
        if isinstance(e, SellerNotFoundError):
            return {"status": "not_found"}
        _handle_seller_error(e)


@router.put("/sellers/{tg_id}/block")
async def block_seller(tg_id: int, is_blocked: bool, session: AsyncSession = Depends(get_session)):
    """Заблокировать/разблокировать продавца"""
    action = "blocking" if is_blocked else "unblocking"
    logger.info(f"Admin {action} seller", tg_id=tg_id, is_blocked=is_blocked)
    
    service = SellerService(session)
    
    try:
        result = await service.block_seller(tg_id, is_blocked)
        logger.info(f"Seller {action} completed", tg_id=tg_id)
        return result
    except SellerNotFoundError:
        logger.warning(f"Seller {action} failed: not found", tg_id=tg_id)
        return {"status": "not_found"}


@router.put("/sellers/{tg_id}/soft-delete")
async def soft_delete_seller(tg_id: int, session: AsyncSession = Depends(get_session)):
    """
    Soft Delete продавца (скрыть).
    Устанавливает deleted_at = now, сохраняя все данные и историю заказов.
    """
    logger.info("Soft deleting seller", tg_id=tg_id)
    service = SellerService(session)
    
    try:
        result = await service.soft_delete(tg_id)
        logger.info("Seller soft deleted", tg_id=tg_id)
        return result
    except SellerNotFoundError:
        logger.warning("Soft delete failed: seller not found", tg_id=tg_id)
        return {"status": "not_found"}


@router.put("/sellers/{tg_id}/restore")
async def restore_seller(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Восстановить soft-deleted продавца."""
    service = SellerService(session)
    
    try:
        return await service.restore(tg_id)
    except SellerNotFoundError:
        return {"status": "not_found"}


@router.delete("/sellers/{tg_id}")
async def delete_seller(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Удалить продавца (Hard Delete). История заказов не удаляется."""
    service = SellerService(session)
    
    try:
        return await service.hard_delete(tg_id)
    except SellerNotFoundError:
        return {"status": "not_found"}


@router.post("/sellers/{tg_id}/reset_counters")
async def reset_seller_counters(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Сбросить счетчики заказов продавца (active_orders, pending_requests)"""
    service = SellerService(session)
    
    try:
        return await service.reset_counters(tg_id)
    except SellerNotFoundError:
        return {"status": "not_found"}


@router.put("/sellers/{tg_id}/set_limit")
async def set_seller_limit(tg_id: int, max_orders: int, session: AsyncSession = Depends(get_session)):
    """Установить лимит заказов продавца (админ)"""
    service = SellerService(session)

    try:
        return await service.set_order_limit(tg_id, max_orders)
    except SellerNotFoundError:
        return {"status": "not_found"}
    except SellerServiceError as e:
        return {"status": "error", "message": e.message}


@router.get("/sellers/{tg_id}/subscription")
async def get_seller_subscription(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Получить текущую подписку и историю для продавца."""
    from backend.app.services.subscription import SubscriptionService
    sub_service = SubscriptionService(session)
    active = await sub_service.get_active_subscription(tg_id)
    history = await sub_service.get_subscription_history(tg_id)
    return {"active": active, "history": history}


@router.put("/sellers/{tg_id}/subscription_plan")
async def set_subscription_plan(tg_id: int, plan: str, session: AsyncSession = Depends(get_session)):
    """Изменить тарифный план продавца (free/pro/premium)."""
    service = SellerService(session)
    try:
        return await service.update_subscription_plan(tg_id, plan)
    except SellerNotFoundError:
        return {"status": "not_found"}
    except SellerServiceError as e:
        return {"status": "error", "message": e.message}


@router.put("/sellers/{tg_id}/default_limit")
async def set_default_limit(
    tg_id: int,
    max_delivery_orders: Optional[int] = Query(None, ge=0),
    max_pickup_orders: Optional[int] = Query(None, ge=0),
    session: AsyncSession = Depends(get_session),
):
    """Установить лимиты доставки/самовывоза продавца (админ). default_daily_limit = сумма."""
    service = SellerService(session)
    try:
        delivery = max_delivery_orders if max_delivery_orders is not None else 10
        pickup = max_pickup_orders if max_pickup_orders is not None else 20
        return await service.update_default_limit(
            tg_id,
            default_daily_limit=delivery + pickup,
            max_delivery_orders=max_delivery_orders,
            max_pickup_orders=max_pickup_orders,
        )
    except SellerNotFoundError:
        return {"status": "not_found"}
    except SellerServiceError as e:
        return {"status": "error", "message": e.message}


@router.get("/sellers/{tg_id}/web_credentials")
async def get_seller_web_credentials(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Получить текущие данные для входа. Пароль возвращается только при стандартном формате (Seller+id)."""
    from sqlalchemy import select
    from backend.app.models.seller import Seller

    try:
        result = await session.execute(select(Seller).where(Seller.seller_id == tg_id))
        seller = result.scalar_one_or_none()
        if not seller:
            return {"status": "not_found", "web_login": None, "web_password": None}
        web_login = getattr(seller, "web_login", None)
        if not web_login:
            return {"status": "ok", "web_login": None, "web_password": None}
        is_standard = web_login == f"Seller{tg_id}"
        return {
            "status": "ok",
            "web_login": web_login,
            "web_password": str(tg_id) if is_standard else None,
        }
    except Exception as e:
        logger.exception("get_web_credentials failed", tg_id=tg_id, error=str(e))
        return {"status": "error", "web_login": None, "web_password": None}


@router.post("/sellers/{tg_id}/set_web_credentials")
async def set_seller_web_credentials(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Установить логин и пароль для веб-панели: login=Seller{tg_id}, password={tg_id}."""
    from sqlalchemy import select
    from sqlalchemy.exc import IntegrityError
    from backend.app.models.seller import Seller

    try:
        result = await session.execute(select(Seller).where(Seller.seller_id == tg_id))
        seller = result.scalar_one_or_none()
        if not seller:
            return {"status": "not_found"}
        web_login = f"Seller{tg_id}"
        web_password = str(tg_id)
        seller.web_login = web_login
        seller.web_password_hash = hash_password(web_password)
        await session.commit()
        return {"status": "ok", "web_login": web_login, "web_password": web_password}
    except IntegrityError:
        await session.rollback()
        logger.exception("set_web_credentials IntegrityError", tg_id=tg_id)
        raise HTTPException(status_code=400, detail="Ошибка: такой логин уже используется другим продавцом")
    except Exception as e:
        await session.rollback()
        logger.exception("set_web_credentials failed", tg_id=tg_id, error=str(e))
        err_msg = str(e)
        if "web_login" in err_msg or "web_password" in err_msg or "column" in err_msg.lower():
            raise HTTPException(status_code=500, detail="Ошибка БД. Выполните миграции: python run_migrations.py")
        raise HTTPException(status_code=500, detail=err_msg)


@router.get("/sellers/{owner_id}/branches")
async def get_seller_branches(
    owner_id: int,
    session: AsyncSession = Depends(get_session),
):
    """Список всех филиалов продавца (включая основной)."""
    from backend.app.models.seller import Seller
    result = await session.execute(
        select(Seller).where(
            Seller.owner_id == owner_id,
            Seller.deleted_at.is_(None),
        ).order_by(Seller.seller_id)
    )
    return [
        {
            "seller_id": s.seller_id,
            "shop_name": s.shop_name,
            "address_name": getattr(s, "address_name", None),
            "is_owner": s.seller_id == s.owner_id,
            "is_blocked": s.is_blocked,
        }
        for s in result.scalars().all()
    ]


@router.get("/finance/seller/{owner_id}/branches")
async def get_finance_by_branches(
    owner_id: int,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    _token: None = Depends(require_admin_token),
):
    """Финансовая разбивка по филиалам одного продавца."""
    from datetime import datetime as dt, time as time_t, timedelta, date as date_type
    from decimal import Decimal
    from sqlalchemy import desc
    from backend.app.models.order import Order
    from backend.app.models.seller import Seller
    from backend.app.models.settings import GlobalSettings as _GS

    _gs_r = await session.execute(select(_GS).order_by(_GS.id))
    _gs = _gs_r.scalar_one_or_none()
    _global_pct = _gs.commission_percent if _gs else 3

    if date_from:
        d_from = dt.combine(dt.fromisoformat(date_from[:10]).date(), time_t.min)
    else:
        d_from = dt.combine(date_type.today() - timedelta(days=30), time_t.min)
    if date_to:
        d_to = dt.combine(dt.fromisoformat(date_to[:10]).date(), time_t.max)
    else:
        d_to = dt.combine(date_type.today(), time_t.max)

    completed_statuses = ["done", "completed"]

    q = (
        select(
            Seller.seller_id,
            Seller.shop_name,
            Seller.address_name,
            Seller.commission_percent,
            func.count(Order.id).label("orders"),
            func.coalesce(func.sum(Order.total_price), 0).label("revenue"),
        )
        .join(Order, Order.seller_id == Seller.seller_id)
        .where(
            Seller.owner_id == owner_id,
            Seller.deleted_at.is_(None),
            Order.status.in_(completed_statuses),
            Order.created_at >= d_from,
            Order.created_at <= d_to,
        )
        .group_by(Seller.seller_id, Seller.shop_name, Seller.address_name, Seller.commission_percent)
        .order_by(desc("revenue"))
    )
    rows = (await session.execute(q)).all()

    result = []
    for r in rows:
        eff_pct = r.commission_percent if r.commission_percent is not None else _global_pct
        eff_rate = Decimal(str(eff_pct / 100))
        result.append({
            "seller_id": r.seller_id,
            "shop_name": r.shop_name or f"#{r.seller_id}",
            "address_name": r.address_name,
            "orders": r.orders,
            "revenue": round(float(r.revenue)),
            "commission": round(float(r.revenue) * float(eff_rate)),
        })

    return result


# ============================================
# СТАТИСТИКА
# ============================================

@router.get("/stats/all")
async def get_all_stats(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    _admin: None = Depends(require_admin_token),
):
    """Общая статистика всех продавцов. Опционально: date_from, date_to (дата YYYY-MM-DD)."""
    from datetime import datetime as dt, time
    service = SellerService(session)
    d_from = None
    d_to = None
    if date_from:
        d_from = dt.combine(dt.fromisoformat(date_from[:10]).date(), time.min)
    if date_to:
        d_to = dt.combine(dt.fromisoformat(date_to[:10]).date(), time.max)
    return await service.get_all_stats(date_from=d_from, date_to=d_to)


@router.get("/stats/overview")
async def get_stats_overview(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    _admin: None = Depends(require_admin_token),
):
    """Дневная статистика по платформе для графика (выполненные заказы). date_from, date_to — YYYY-MM-DD."""
    from datetime import datetime as dt, time
    d_from = None
    d_to = None
    if date_from:
        d_from = dt.combine(dt.fromisoformat(date_from[:10]).date(), time.min)
    if date_to:
        d_to = dt.combine(dt.fromisoformat(date_to[:10]).date(), time.max)
    order_service = OrderService(session)
    return await order_service.get_platform_daily_stats(date_from=d_from, date_to=d_to)


@router.get("/stats/seller")
async def get_seller_stats(fio: str, session: AsyncSession = Depends(get_session), _admin: None = Depends(require_admin_token)):
    """Статистика конкретного продавца по ФИО"""
    service = SellerService(session)
    return await service.get_seller_stats_by_fio(fio)


@router.get("/stats/limits")
async def get_limits_analytics(session: AsyncSession = Depends(get_session), _admin: None = Depends(require_admin_token)):
    """Аналитика загрузки лимитов продавцов: активные, исчерпавшие, средняя загрузка, разбивка по тарифам."""
    service = SellerService(session)
    try:
        return await service.get_limits_analytics()
    except Exception:
        logger.exception("get_limits_analytics failed")
        return {
            "total_sellers": 0,
            "active_today": 0,
            "exhausted": 0,
            "closed_today": 0,
            "no_limit": 0,
            "avg_load_pct": 0.0,
            "by_plan": {},
            "top_loaded": [],
        }


# ============================================
# КЭШИРОВАНИЕ
# ============================================

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


# ============================================
# DASHBOARD  (агрегированные данные для главной)
# ============================================

@router.get("/dashboard")
async def get_admin_dashboard(session: AsyncSession = Depends(get_session), _token: None = Depends(require_admin_token)):
    """Агрегированные данные для главной страницы админ-панели."""
    from datetime import datetime as dt, time, timedelta, date as date_type
    from sqlalchemy import select, func, case, and_, or_, literal_column
    from decimal import Decimal
    from backend.app.models.order import Order
    from backend.app.models.seller import Seller
    from backend.app.models.user import User

    today_start = dt.combine(date_type.today(), time.min)
    yesterday_start = today_start - timedelta(days=1)
    week_ago = today_start - timedelta(days=7)
    # Read commission rate from DB (per-seller not applicable here — aggregate)
    from backend.app.models.settings import GlobalSettings as _GS
    _gs_r = await session.execute(select(_GS).order_by(_GS.id))
    _gs = _gs_r.scalar_one_or_none()
    COMMISSION = Decimal(str((_gs.commission_percent if _gs else 3) / 100))

    # ── today vs yesterday ──
    # Only count completed orders as revenue (not pending/rejected/cancelled)
    completed_statuses = ["done", "completed"]

    # All orders today (for order count — useful to see total activity)
    q_today_all = select(
        func.count(Order.id).label("cnt"),
    ).where(Order.created_at >= today_start)
    q_yest_all = select(
        func.count(Order.id).label("cnt"),
    ).where(and_(Order.created_at >= yesterday_start, Order.created_at < today_start))

    # Completed orders only (for revenue, profit, avg check)
    q_today_completed = select(
        func.coalesce(func.sum(Order.total_price), 0).label("rev"),
        func.coalesce(func.avg(Order.total_price), 0).label("avg_chk"),
    ).where(and_(Order.created_at >= today_start, Order.status.in_(completed_statuses)))
    q_yest_completed = select(
        func.coalesce(func.sum(Order.total_price), 0).label("rev"),
        func.coalesce(func.avg(Order.total_price), 0).label("avg_chk"),
    ).where(and_(Order.created_at >= yesterday_start, Order.created_at < today_start, Order.status.in_(completed_statuses)))

    q_new_cust_today = select(func.count(User.tg_id)).where(
        and_(User.created_at >= today_start, User.role == "BUYER")
    )
    q_new_cust_yest = select(func.count(User.tg_id)).where(
        and_(User.created_at >= yesterday_start, User.created_at < today_start, User.role == "BUYER")
    )

    r_today_all = (await session.execute(q_today_all)).one()
    r_yest_all = (await session.execute(q_yest_all)).one()
    r_today_completed = (await session.execute(q_today_completed)).one()
    r_yest_completed = (await session.execute(q_yest_completed)).one()
    new_today = (await session.execute(q_new_cust_today)).scalar() or 0
    new_yest = (await session.execute(q_new_cust_yest)).scalar() or 0

    rev_today = float(r_today_completed.rev)
    rev_yest = float(r_yest_completed.rev)

    today_data = {
        "orders": r_today_all.cnt,
        "orders_yesterday": r_yest_all.cnt,
        "revenue": round(rev_today),
        "revenue_yesterday": round(rev_yest),
        "profit": round(rev_today * float(COMMISSION)),
        "profit_yesterday": round(rev_yest * float(COMMISSION)),
        "avg_check": round(float(r_today_completed.avg_chk)),
        "avg_check_yesterday": round(float(r_yest_completed.avg_chk)),
        "new_customers": new_today,
        "new_customers_yesterday": new_yest,
    }

    # ── pipeline ──
    pipe_statuses = {
        "pending": ["pending"],
        "in_progress": ["accepted", "assembling"],
        "in_transit": ["in_transit", "ready_for_pickup"],
    }
    pipeline = {}
    for key, statuses in pipe_statuses.items():
        q = select(
            func.count(Order.id), func.coalesce(func.sum(Order.total_price), 0)
        ).where(Order.status.in_(statuses))
        row = (await session.execute(q)).one()
        pipeline[key] = {"count": row[0], "amount": round(float(row[1]))}

    for label, status_list in [("completed_today", ["done", "completed"]), ("rejected_today", ["rejected", "cancelled"])]:
        q = select(
            func.count(Order.id), func.coalesce(func.sum(Order.total_price), 0)
        ).where(and_(Order.status.in_(status_list), Order.created_at >= today_start))
        row = (await session.execute(q)).one()
        pipeline[label] = {"count": row[0], "amount": round(float(row[1]))}

    # ── alerts ──
    # expiring placements (< 7 days)
    seven_days = dt.now() + timedelta(days=7)
    q_exp = select(Seller.seller_id, Seller.shop_name, Seller.placement_expired_at).where(
        and_(
            Seller.placement_expired_at.isnot(None),
            Seller.placement_expired_at <= seven_days,
            Seller.placement_expired_at > dt.now(),
            Seller.deleted_at.is_(None),
        )
    )
    exp_rows = (await session.execute(q_exp)).all()
    expiring = [
        {"tg_id": r[0], "shop_name": r[1] or "", "expires_in_days": max(0, (r[2] - dt.now()).days)}
        for r in exp_rows
    ]

    # exhausted limits
    q_exh = select(Seller.seller_id, Seller.shop_name, Seller.active_orders, Seller.max_orders).where(
        and_(
            Seller.max_orders > 0,
            Seller.active_orders >= Seller.max_orders,
            Seller.deleted_at.is_(None),
            Seller.is_blocked == False,
        )
    )
    exh_rows = (await session.execute(q_exh)).all()
    exhausted = [
        {"tg_id": r[0], "shop_name": r[1] or "", "used": r[2] or 0, "limit": r[3] or 0}
        for r in exh_rows
    ]

    # stuck orders (pending > 30 min)
    thirty_min_ago = dt.now() - timedelta(minutes=30)
    q_stuck = (
        select(Order.id, Order.total_price, Order.created_at, Seller.shop_name, Order.seller_id)
        .join(Seller, Seller.seller_id == Order.seller_id)
        .where(and_(Order.status == "pending", Order.created_at < thirty_min_ago))
        .order_by(Order.created_at)
        .limit(10)
    )
    stuck_rows = (await session.execute(q_stuck)).all()
    stuck = [
        {
            "order_id": r[0],
            "seller_id": r[4],
            "seller_name": r[3] or "",
            "minutes_pending": int((dt.now() - r[2]).total_seconds() / 60),
            "amount": round(float(r[1] or 0)),
        }
        for r in stuck_rows
    ]

    # ── weekly revenue (completed orders only) ──
    q_weekly = (
        select(
            func.date(Order.created_at).label("d"),
            func.count(Order.id).label("orders"),
            func.coalesce(func.sum(Order.total_price), 0).label("revenue"),
        )
        .where(and_(Order.created_at >= week_ago, Order.status.in_(completed_statuses)))
        .group_by(func.date(Order.created_at))
        .order_by(literal_column("d"))
    )
    weekly_rows = (await session.execute(q_weekly)).all()
    weekly_revenue = [
        {"date": str(r.d), "revenue": round(float(r.revenue)), "orders": r.orders}
        for r in weekly_rows
    ]

    # ── top sellers today (completed orders only) ──
    q_top = (
        select(
            Seller.seller_id,
            Seller.shop_name,
            func.count(Order.id).label("orders"),
            func.coalesce(func.sum(Order.total_price), 0).label("revenue"),
            Seller.max_orders,
            Seller.active_orders,
        )
        .join(Order, Order.seller_id == Seller.seller_id)
        .where(and_(Order.created_at >= today_start, Order.status.in_(completed_statuses)))
        .group_by(Seller.seller_id, Seller.shop_name, Seller.max_orders, Seller.active_orders)
        .order_by(func.count(Order.id).desc())
        .limit(5)
    )
    top_rows = (await session.execute(q_top)).all()
    top_sellers = [
        {
            "tg_id": r.seller_id,
            "shop_name": r.shop_name or "",
            "orders": r.orders,
            "revenue": round(float(r.revenue)),
            "load_pct": round((r.active_orders or 0) / r.max_orders * 100) if r.max_orders else 0,
        }
        for r in top_rows
    ]

    # ── totals ──
    total_sellers = (await session.execute(
        select(func.count(Seller.seller_id)).where(Seller.deleted_at.is_(None))
    )).scalar() or 0
    total_buyers = (await session.execute(
        select(func.count(User.tg_id)).where(User.role == "BUYER")
    )).scalar() or 0
    total_orders = (await session.execute(select(func.count(Order.id)))).scalar() or 0

    return {
        "today": today_data,
        "pipeline": pipeline,
        "alerts": {
            "expiring_placements": expiring,
            "exhausted_limits": exhausted,
            "stuck_orders": stuck,
        },
        "weekly_revenue": weekly_revenue,
        "top_sellers_today": top_sellers,
        "totals": {"sellers": total_sellers, "buyers": total_buyers, "orders": total_orders},
    }


# ============================================
# ЗАКАЗЫ (полный список с фильтрами)
# ============================================

@router.get("/orders")
async def get_admin_orders(
    status: Optional[str] = None,
    seller_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    delivery_type: Optional[str] = None,
    is_preorder: Optional[bool] = None,
    page: int = 1,
    per_page: int = 50,
    session: AsyncSession = Depends(get_session),
    _token: None = Depends(require_admin_token),
):
    """Список всех заказов платформы с фильтрами и пагинацией."""
    from datetime import datetime as dt, time as time_t
    from sqlalchemy import select, func, and_
    from backend.app.models.order import Order
    from backend.app.models.seller import Seller
    from backend.app.models.user import User

    filters = []
    if status:
        filters.append(Order.status == status)
    if seller_id:
        filters.append(Order.seller_id == seller_id)
    if date_from:
        filters.append(Order.created_at >= dt.combine(dt.fromisoformat(date_from[:10]).date(), time_t.min))
    if date_to:
        filters.append(Order.created_at <= dt.combine(dt.fromisoformat(date_to[:10]).date(), time_t.max))
    if delivery_type:
        filters.append(Order.delivery_type == delivery_type)
    if is_preorder is not None:
        filters.append(Order.is_preorder == is_preorder)

    where = and_(*filters) if filters else True

    # counts by status
    q_counts = select(Order.status, func.count(Order.id)).where(where).group_by(Order.status)
    count_rows = (await session.execute(q_counts)).all()
    status_breakdown = {r[0]: r[1] for r in count_rows}
    total = sum(status_breakdown.values())

    # total amount (all matching filters — informational)
    q_sum = select(func.coalesce(func.sum(Order.total_price), 0)).where(where)
    total_amount = float((await session.execute(q_sum)).scalar() or 0)

    # completed amount (actual revenue — only done/completed orders within filters)
    completed_filters = list(filters) + [Order.status.in_(["done", "completed"])]
    q_completed_sum = select(func.coalesce(func.sum(Order.total_price), 0)).where(and_(*completed_filters))
    completed_amount = float((await session.execute(q_completed_sum)).scalar() or 0)

    # paginated orders
    offset = (page - 1) * per_page
    q_orders = (
        select(
            Order.id,
            Order.buyer_id,
            Order.seller_id,
            Order.items_info,
            Order.total_price,
            Order.original_price,
            Order.points_discount,
            Order.status,
            Order.delivery_type,
            Order.address,
            Order.comment,
            Order.created_at,
            Order.completed_at,
            Order.is_preorder,
            Order.preorder_delivery_date,
            Seller.shop_name.label("seller_name"),
            User.fio.label("buyer_fio"),
            User.phone.label("buyer_phone"),
            Order.guest_name,
            Order.guest_phone,
        )
        .outerjoin(Seller, Seller.seller_id == Order.seller_id)
        .outerjoin(User, User.tg_id == Order.buyer_id)
        .where(where)
        .order_by(Order.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    rows = (await session.execute(q_orders)).all()

    orders = []
    for r in rows:
        orders.append({
            "id": r.id,
            "buyer_id": r.buyer_id,
            "seller_id": r.seller_id,
            "items_info": r.items_info,
            "total_price": round(float(r.total_price or 0)),
            "original_price": round(float(r.original_price)) if r.original_price else None,
            "points_discount": round(float(r.points_discount or 0)),
            "status": r.status,
            "delivery_type": r.delivery_type,
            "address": r.address,
            "comment": r.comment,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "is_preorder": r.is_preorder or False,
            "preorder_delivery_date": str(r.preorder_delivery_date) if r.preorder_delivery_date else None,
            "seller_name": r.seller_name or "",
            "buyer_fio": r.guest_name or r.buyer_fio or "",
            "buyer_phone": r.guest_phone or r.buyer_phone or "",
        })

    # sellers list for filter dropdown
    q_sellers = select(Seller.seller_id, Seller.shop_name).where(Seller.deleted_at.is_(None)).order_by(Seller.shop_name)
    seller_rows = (await session.execute(q_sellers)).all()
    sellers_list = [{"id": r[0], "name": r[1] or f"#{r[0]}"} for r in seller_rows]

    pages = max(1, -(-total // per_page))  # ceil division

    return {
        "orders": orders,
        "total": total,
        "pages": pages,
        "page": page,
        "status_breakdown": status_breakdown,
        "total_amount": round(total_amount),
        "completed_amount": round(completed_amount),
        "sellers_list": sellers_list,
    }


# ============================================
# ПОКУПАТЕЛИ (клиентская база)
# ============================================

@router.get("/customers")
async def get_admin_customers(
    city_id: Optional[int] = None,
    min_orders: Optional[int] = None,
    page: int = 1,
    per_page: int = 30,
    session: AsyncSession = Depends(get_session),
    _token: None = Depends(require_admin_token),
):
    """Список покупателей с агрегированной статистикой."""
    from datetime import datetime as dt, time as time_t, date as date_type
    from sqlalchemy import select, func, and_, or_, desc, case, union_all
    from sqlalchemy.orm import aliased
    from backend.app.models.order import Order
    from backend.app.models.user import User
    from backend.app.models.seller import City

    # Separate alias for User inside UNION ALL subqueries to avoid
    # SQLAlchemy mapper conflict with the outer query's User reference
    GuestUser = aliased(User, flat=True)

    today_start = dt.combine(date_type.today(), time_t.min)
    # Exclude only rejected/cancelled — accepted orders already represent real spending
    excluded_statuses = ["rejected", "cancelled"]

    # summary
    total_buyers = (await session.execute(
        select(func.count(User.tg_id)).where(User.role == "BUYER")
    )).scalar() or 0

    # active_buyers: count distinct users who placed orders (auth + guest matched by phone)
    _auth_buyer_ids = (
        select(Order.buyer_id.label("uid"))
        .where(Order.status.notin_(excluded_statuses), Order.buyer_id.isnot(None))
    )
    _guest_buyer_ids = (
        select(GuestUser.tg_id.label("uid"))
        .select_from(Order)
        .join(GuestUser, Order.guest_phone == GuestUser.phone)
        .where(
            Order.status.notin_(excluded_statuses),
            Order.buyer_id.is_(None),
            Order.guest_phone.isnot(None), Order.guest_phone != "",
            GuestUser.phone.isnot(None), GuestUser.phone != "",
        )
    )
    _all_buyer_ids = union_all(_auth_buyer_ids, _guest_buyer_ids).subquery("all_buyers")
    active_buyers = (await session.execute(
        select(func.count(func.distinct(_all_buyer_ids.c.uid)))
    )).scalar() or 0

    new_today = (await session.execute(
        select(func.count(User.tg_id)).where(and_(User.role == "BUYER", User.created_at >= today_start))
    )).scalar() or 0

    avg_ltv_r = (await session.execute(
        select(func.avg(func.coalesce(Order.total_price, 0))).where(
            Order.status.notin_(excluded_statuses)
        )
    )).scalar()
    avg_ltv = round(float(avg_ltv_r or 0))

    # city distribution
    q_city = (
        select(City.name, func.count(User.tg_id))
        .join(User, User.city_id == City.id)
        .where(User.role == "BUYER")
        .group_by(City.name)
        .order_by(func.count(User.tg_id).desc())
        .limit(10)
    )
    city_rows = (await session.execute(q_city)).all()
    city_distribution = [{"city": r[0], "count": r[1]} for r in city_rows]

    # Two separate subqueries instead of UNION ALL (avoids SQLAlchemy mapper issues)
    # Subquery 1: authenticated orders aggregated by buyer_id
    auth_stats = (
        select(
            Order.buyer_id.label("user_id"),
            func.count(Order.id).label("cnt"),
            func.coalesce(func.sum(Order.total_price), 0).label("spent"),
            func.max(Order.created_at).label("last_at"),
        )
        .where(Order.status.notin_(excluded_statuses), Order.buyer_id.isnot(None))
        .group_by(Order.buyer_id)
        .subquery("auth_stats")
    )
    # Subquery 2: guest orders aggregated by matched user (phone)
    guest_stats = (
        select(
            GuestUser.tg_id.label("user_id"),
            func.count(Order.id).label("cnt"),
            func.coalesce(func.sum(Order.total_price), 0).label("spent"),
            func.max(Order.created_at).label("last_at"),
        )
        .select_from(Order)
        .join(GuestUser, Order.guest_phone == GuestUser.phone)
        .where(
            Order.status.notin_(excluded_statuses),
            Order.buyer_id.is_(None),
            Order.guest_phone.isnot(None), Order.guest_phone != "",
            GuestUser.phone.isnot(None), GuestUser.phone != "",
        )
        .group_by(GuestUser.tg_id)
        .subquery("guest_stats")
    )

    # Combine auth + guest stats with addition (handles NULLs via COALESCE)
    orders_count_expr = (
        func.coalesce(auth_stats.c.cnt, 0) + func.coalesce(guest_stats.c.cnt, 0)
    )
    total_spent_expr = (
        func.coalesce(auth_stats.c.spent, 0) + func.coalesce(guest_stats.c.spent, 0)
    )

    q_base = (
        select(
            User.tg_id,
            User.fio,
            User.username,
            User.phone,
            User.created_at.label("registered_at"),
            City.name.label("city"),
            orders_count_expr.label("orders_count"),
            total_spent_expr.label("total_spent"),
            func.greatest(auth_stats.c.last_at, guest_stats.c.last_at).label("last_order_at"),
        )
        .outerjoin(auth_stats, auth_stats.c.user_id == User.tg_id)
        .outerjoin(guest_stats, guest_stats.c.user_id == User.tg_id)
        .outerjoin(City, City.id == User.city_id)
        .where(or_(
            User.role == "BUYER",
            auth_stats.c.user_id.isnot(None),
            guest_stats.c.user_id.isnot(None),
        ))
    )

    if city_id:
        q_base = q_base.where(User.city_id == city_id)
    if min_orders:
        q_base = q_base.where(orders_count_expr >= min_orders)

    # count for pagination
    from sqlalchemy import text
    count_q = select(func.count()).select_from(q_base.subquery())
    total_filtered = (await session.execute(count_q)).scalar() or 0
    pages = max(1, -(-total_filtered // per_page))

    offset = (page - 1) * per_page
    q_final = q_base.order_by(desc("orders_count")).offset(offset).limit(per_page)
    rows = (await session.execute(q_final)).all()

    customers = []
    for r in rows:
        customers.append({
            "tg_id": r.tg_id,
            "fio": r.fio,
            "username": r.username,
            "phone": r.phone,
            "city": r.city,
            "orders_count": r.orders_count,
            "total_spent": round(float(r.total_spent)),
            "last_order_at": r.last_order_at.isoformat() if r.last_order_at else None,
            "registered_at": r.registered_at.isoformat() if r.registered_at else None,
        })

    return {
        "customers": customers,
        "total": total_filtered,
        "pages": pages,
        "page": page,
        "summary": {
            "total_buyers": total_buyers,
            "active_buyers": active_buyers,
            "new_today": new_today,
            "avg_ltv": avg_ltv,
        },
        "city_distribution": city_distribution,
    }


# ============================================
# ФИНАНСЫ (финансовая аналитика)
# ============================================

@router.get("/finance/summary")
async def get_finance_summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    group_by: str = "day",
    session: AsyncSession = Depends(get_session),
    _token: None = Depends(require_admin_token),
):
    """Финансовая сводка с динамикой и разбивкой по продавцам."""
    from datetime import datetime as dt, time as time_t, timedelta, date as date_type
    from sqlalchemy import select, func, and_, desc, extract, literal_column
    from decimal import Decimal
    from backend.app.models.order import Order
    from backend.app.models.seller import Seller
    from backend.app.models.settings import GlobalSettings as _GS

    # Read global commission from DB
    _gs_r = await session.execute(select(_GS).order_by(_GS.id))
    _gs = _gs_r.scalar_one_or_none()
    _global_pct = _gs.commission_percent if _gs else 3
    COMMISSION = Decimal(str(_global_pct / 100))

    # Date range
    if date_from:
        d_from = dt.combine(dt.fromisoformat(date_from[:10]).date(), time_t.min)
    else:
        d_from = dt.combine(date_type.today() - timedelta(days=30), time_t.min)
    if date_to:
        d_to = dt.combine(dt.fromisoformat(date_to[:10]).date(), time_t.max)
    else:
        d_to = dt.combine(date_type.today(), time_t.max)

    completed_statuses = ["done", "completed"]
    where_current = and_(
        Order.status.in_(completed_statuses),
        Order.created_at >= d_from,
        Order.created_at <= d_to,
    )

    # Current period KPIs
    q_kpi = select(
        func.count(Order.id).label("cnt"),
        func.coalesce(func.sum(Order.total_price), 0).label("rev"),
        func.coalesce(func.avg(Order.total_price), 0).label("avg_chk"),
    ).where(where_current)
    kpi = (await session.execute(q_kpi)).one()

    revenue = float(kpi.rev)
    profit = round(revenue * float(COMMISSION))

    # Previous period (same length)
    period_len = (d_to - d_from).days or 1
    prev_from = d_from - timedelta(days=period_len)
    prev_to = d_from - timedelta(seconds=1)
    where_prev = and_(
        Order.status.in_(completed_statuses),
        Order.created_at >= prev_from,
        Order.created_at <= prev_to,
    )
    q_prev = select(
        func.count(Order.id).label("cnt"),
        func.coalesce(func.sum(Order.total_price), 0).label("rev"),
        func.coalesce(func.avg(Order.total_price), 0).label("avg_chk"),
    ).where(where_prev)
    prev = (await session.execute(q_prev)).one()

    period_data = {
        "revenue": round(revenue),
        "profit": profit,
        "orders": kpi.cnt,
        "avg_check": round(float(kpi.avg_chk)),
    }
    previous_period_data = {
        "revenue": round(float(prev.rev)),
        "profit": round(float(prev.rev) * float(COMMISSION)),
        "orders": prev.cnt,
        "avg_check": round(float(prev.avg_chk)),
    }

    # Time series
    if group_by == "week":
        grp = func.date_trunc('week', Order.created_at)
    elif group_by == "month":
        grp = func.date_trunc('month', Order.created_at)
    else:
        grp = func.date(Order.created_at)

    q_series = (
        select(
            grp.label("period"),
            func.count(Order.id).label("orders"),
            func.coalesce(func.sum(Order.total_price), 0).label("revenue"),
        )
        .where(where_current)
        .group_by(literal_column("period"))
        .order_by(literal_column("period"))
    )
    series_rows = (await session.execute(q_series)).all()

    if group_by == "day":
        # Pad missing days with zeros (consistent with get_platform_daily_stats)
        daily_map = {}
        for r in series_rows:
            day_val = r.period
            if isinstance(day_val, str):
                day_val = dt.fromisoformat(day_val[:10]).date()
            elif hasattr(day_val, 'date') and callable(day_val.date):
                day_val = day_val.date()
            daily_map[day_val] = {"orders": r.orders, "revenue": round(float(r.revenue))}

        series = []
        current_day = d_from.date()
        end_day = d_to.date()
        while current_day <= end_day:
            point = daily_map.get(current_day, {"orders": 0, "revenue": 0})
            series.append({
                "period": current_day.isoformat(),
                "orders": point["orders"],
                "revenue": point["revenue"],
            })
            current_day += timedelta(days=1)
    else:
        # Week/month grouping — no day-level padding needed
        series = [
            {"period": str(r.period), "orders": r.orders, "revenue": round(float(r.revenue))}
            for r in series_rows
        ]

    # By seller (grouped by owner_id so branches are aggregated)
    from sqlalchemy.orm import aliased
    OwnerSeller = aliased(Seller)
    q_sellers = (
        select(
            Seller.owner_id.label("owner_id"),
            OwnerSeller.shop_name,
            OwnerSeller.subscription_plan,
            OwnerSeller.commission_percent,
            func.count(Order.id).label("orders"),
            func.coalesce(func.sum(Order.total_price), 0).label("revenue"),
        )
        .join(Order, Order.seller_id == Seller.seller_id)
        .join(OwnerSeller, OwnerSeller.seller_id == Seller.owner_id)
        .where(where_current)
        .group_by(Seller.owner_id, OwnerSeller.shop_name, OwnerSeller.subscription_plan, OwnerSeller.commission_percent)
        .order_by(desc("revenue"))
    )
    seller_rows = (await session.execute(q_sellers)).all()

    total_rev = revenue or 1
    sellers = []
    for r in seller_rows:
        # Per-seller commission override > global
        eff_pct = r.commission_percent if r.commission_percent is not None else _global_pct
        eff_rate = Decimal(str(eff_pct / 100))
        sellers.append({
            "seller_id": r.owner_id,
            "shop_name": r.shop_name or f"#{r.owner_id}",
            "plan": r.subscription_plan or "free",
            "orders": r.orders,
            "revenue": round(float(r.revenue)),
            "commission": round(float(r.revenue) * float(eff_rate)),
            "commission_rate": eff_pct,
            "share_pct": round(float(r.revenue) / total_rev * 100, 1),
        })

    return {
        "period": period_data,
        "previous_period": previous_period_data,
        "series": series,
        "by_seller": sellers,
        "global_commission_rate": _global_pct,
        "date_from": d_from.date().isoformat(),
        "date_to": d_to.date().isoformat(),
    }


# ── Commission settings ──────────────────────────────────────────────

@router.get("/settings/commission")
async def get_global_commission(
    session: AsyncSession = Depends(get_session),
    _token: None = Depends(require_admin_token),
):
    """Текущий глобальный процент комиссии платформы."""
    from sqlalchemy import select as sa_select
    from backend.app.models.settings import GlobalSettings
    result = await session.execute(
        sa_select(GlobalSettings).order_by(GlobalSettings.id)
    )
    gs = result.scalar_one_or_none()
    return {"commission_percent": gs.commission_percent if gs else 3}


class CommissionUpdateRequest(BaseModel):
    commission_percent: int

    @field_validator("commission_percent")
    @classmethod
    def validate_range(cls, v: int) -> int:
        if v < 0 or v > 100:
            raise ValueError("commission_percent must be between 0 and 100")
        return v


@router.put("/settings/commission")
async def update_global_commission(
    data: CommissionUpdateRequest,
    session: AsyncSession = Depends(get_session),
    _token: None = Depends(require_admin_token),
):
    """Обновить глобальный процент комиссии платформы."""
    from backend.app.models.settings import GlobalSettings
    from sqlalchemy import select as sa_select
    result = await session.execute(sa_select(GlobalSettings).order_by(GlobalSettings.id))
    gs = result.scalar_one_or_none()
    if gs:
        gs.commission_percent = data.commission_percent
    else:
        session.add(GlobalSettings(id=1, commission_percent=data.commission_percent))
    await session.commit()
    return {"status": "ok", "commission_percent": data.commission_percent}
