"""Shared helpers, schemas and dependencies for admin sub-modules."""

import os
from typing import Optional
from datetime import datetime, timezone

from fastapi import Header, HTTPException
from pydantic import BaseModel, field_validator, model_validator

from backend.app.core.logging import get_logger
from backend.app.services.sellers import SellerServiceError

logger = get_logger(__name__)

# Admin panel auth
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "")


async def require_admin_token(
    x_admin_token: Optional[str] = Header(None, alias="X-Admin-Token"),
):
    """Require admin token. If ADMIN_SECRET is not configured, reject all requests (fail-closed)."""
    if not ADMIN_SECRET:
        logger.warning("ADMIN_SECRET not configured — admin endpoints are blocked")
        raise HTTPException(
            status_code=503,
            detail="Admin panel not configured (ADMIN_SECRET missing)",
        )
    if not x_admin_token or x_admin_token != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Invalid or missing admin token")


def _handle_seller_error(e: SellerServiceError):
    """Convert seller service exceptions to HTTP exceptions."""
    raise HTTPException(status_code=e.status_code, detail=e.message)


def _extract_fio(org_data: dict) -> Optional[str]:
    """Extract person name from DaData org data. Works for both LEGAL (management) and INDIVIDUAL (fio)."""
    mgmt = org_data.get("management")
    if mgmt and mgmt.get("name"):
        return mgmt["name"]
    fio = org_data.get("fio")
    if fio:
        parts = [fio.get("surname"), fio.get("name"), fio.get("patronymic")]
        full = " ".join(p for p in parts if p)
        if full:
            return full
    return None


# ── Schemas ──────────────────────────────────────────────────────────

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
        if len(v.strip()) < 2:
            raise ValueError('ФИО должно быть не менее 2 символов')
        if len(v.strip()) > 200:
            raise ValueError('ФИО не может быть длиннее 200 символов')
        return v.strip()

    @field_validator('shop_name')
    @classmethod
    def validate_shop_name(cls, v):
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
        if v is None or v == '':
            return None
        if isinstance(v, datetime):
            if v.tzinfo is not None:
                return v.astimezone(timezone.utc).replace(tzinfo=None)
            return v
        if isinstance(v, str):
            if '-' in v:
                try:
                    from datetime import datetime as _dt
                    dt = _dt.strptime(v[:10], "%Y-%m-%d")
                    return dt
                except ValueError:
                    pass
            if '.' in v:
                try:
                    parts = v.split('.')
                    if len(parts) == 3:
                        d, m, y = int(parts[0]), int(parts[1]), int(parts[2])
                        from datetime import datetime as _dt
                        dt = _dt(y, m, d)
                        return dt
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
