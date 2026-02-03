# backend/app/services/sellers.py
"""
Seller service - handles all seller-related business logic.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo

from backend.app.models.seller import Seller, City, District
from backend.app.models.user import User
from backend.app.models.order import Order
from backend.app.core.password_utils import hash_password, verify_password

# Московское время, «день» начинается в 6:00
LIMIT_TIMEZONE = ZoneInfo("Europe/Moscow")
LIMIT_DAY_START_HOUR = 6


def _today_6am_date() -> date:
    """Текущая «дата дня»: после 6:00 — сегодня, до 6:00 — вчера."""
    now = datetime.now(LIMIT_TIMEZONE)
    if now.hour >= LIMIT_DAY_START_HOUR:
        return now.date()
    return (now - timedelta(days=1)).date()


def _today_6am_utc() -> datetime:
    """Начало текущего «дня» (6:00 МСК) в UTC (naive) для сравнения с БД."""
    d = _today_6am_date()
    local_6am = datetime(d.year, d.month, d.day, LIMIT_DAY_START_HOUR, 0, 0, tzinfo=LIMIT_TIMEZONE)
    utc = local_6am.astimezone(ZoneInfo("UTC"))
    return utc.replace(tzinfo=None)


class SellerServiceError(Exception):
    """Base exception for seller service errors."""
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class SellerNotFoundError(SellerServiceError):
    def __init__(self, seller_id: int):
        super().__init__(f"Seller {seller_id} not found", 404)


class SellerExistsError(SellerServiceError):
    def __init__(self, seller_id: int):
        super().__init__(f"Seller {seller_id} already exists", 409)


class InvalidFieldError(SellerServiceError):
    def __init__(self, field: str):
        super().__init__(f"Invalid field: {field}", 400)


class SellerService:
    """Service class for seller operations."""
    
    VALID_UPDATE_FIELDS = {
        "fio", "phone", "shop_name", "description",
        "map_url", "delivery_type", "delivery_price", "city_id", "district_id",
        "metro_id", "metro_walk_minutes", "placement_expired_at"
    }
    
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _count_completed_since(self, seller_id: int, since: datetime) -> int:
        """Количество заказов в статусе done/completed с момента since (по completed_at или created_at)."""
        result = await self.session.execute(
            select(func.count(Order.id)).where(
                Order.seller_id == seller_id,
                Order.status.in_(("done", "completed")),
                or_(
                    Order.completed_at >= since,
                    and_(Order.completed_at.is_(None), Order.created_at >= since)
                )
            )
        )
        return result.scalar() or 0
    
    async def check_limit(self, seller_id: int) -> bool:
        """
        Проверка: может ли продавец принять новый заказ.
        Лимит — дневной (обнуляется в 6:00 МСК). Учитываются: выполненные сегодня + активные + ожидающие.
        """
        result = await self.session.execute(
            select(Seller).where(Seller.seller_id == seller_id)
        )
        seller = result.scalar_one_or_none()
        
        if not seller:
            return False
        
        today = _today_6am_date()
        if seller.daily_limit_date != today or seller.max_orders <= 0:
            return False
        
        since = _today_6am_utc()
        completed_today = await self._count_completed_since(seller_id, since)
        total_used = completed_today + seller.active_orders + seller.pending_requests
        return total_used < seller.max_orders
    
    async def get_seller(self, seller_id: int) -> Optional[Dict[str, Any]]:
        """Get seller data for display. Включает orders_used_today, limit_set_for_today, fio, phone from User."""
        result = await self.session.execute(
            select(User, Seller)
            .join(Seller, User.tg_id == Seller.seller_id)
            .where(Seller.seller_id == seller_id)
        )
        row = result.first()
        if not row:
            return None
        user, seller = row

        today = _today_6am_date()
        limit_set_for_today = seller.daily_limit_date == today and seller.max_orders > 0
        completed_today = await self._count_completed_since(seller_id, _today_6am_utc()) if limit_set_for_today else 0
        orders_used_today = completed_today + seller.active_orders + seller.pending_requests

        return {
            "seller_id": seller.seller_id,
            "fio": user.fio,
            "phone": user.phone,
            "shop_name": seller.shop_name or "My Shop",
            "description": seller.description,
            "max_orders": seller.max_orders,
            "daily_limit_date": seller.daily_limit_date.isoformat() if seller.daily_limit_date else None,
            "limit_set_for_today": limit_set_for_today,
            "orders_used_today": orders_used_today,
            "active_orders": seller.active_orders,
            "pending_requests": seller.pending_requests,
            "is_blocked": seller.is_blocked,
            "delivery_type": seller.delivery_type,
            "delivery_price": float(seller.delivery_price) if seller.delivery_price else 0.0,
            "city_id": seller.city_id,
            "district_id": seller.district_id,
            "metro_id": seller.metro_id,
            "metro_walk_minutes": seller.metro_walk_minutes,
            "map_url": seller.map_url,
            "placement_expired_at": seller.placement_expired_at.isoformat() if seller.placement_expired_at else None,
            "deleted_at": seller.deleted_at.isoformat() if seller.deleted_at else None,
            "is_deleted": seller.deleted_at is not None,
        }
    
    async def create_seller(
        self,
        tg_id: int,
        fio: str,
        phone: str,
        shop_name: str,
        description: Optional[str] = None,
        city_id: Optional[int] = None,
        district_id: Optional[int] = None,
        map_url: Optional[str] = None,
        metro_id: Optional[int] = None,
        metro_walk_minutes: Optional[int] = None,
        delivery_type: str = "pickup",
        delivery_price: float = 0.0,
        placement_expired_at: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Create a new seller with associated user record.
        Web credentials auto-generated: login=Seller{tg_id}, password={tg_id}.
        
        Returns:
            {"status": "ok", "web_login": str, "web_password": str} on success
            {"status": "exists"} if seller exists
        """
        # Check if seller already exists
        result = await self.session.execute(
            select(Seller).where(Seller.seller_id == tg_id)
        )
        existing = result.scalar_one_or_none()
        if existing:
            return {"status": "exists"}
        
        # Create or update user record
        user_res = await self.session.execute(
            select(User).where(User.tg_id == tg_id)
        )
        user = user_res.scalar_one_or_none()
        
        if not user:
            user = User(
                tg_id=tg_id,
                fio=fio,
                phone=phone,
                role='SELLER'
            )
            self.session.add(user)
        else:
            if user.role != 'ADMIN':
                user.role = 'SELLER'
            user.fio = fio
            user.phone = phone
        
        # Ensure city exists
        await self._ensure_city_exists(city_id)
        
        # Ensure district exists
        await self._ensure_district_exists(district_id, city_id)
        
        # Validate: metro_walk_minutes > 0 when metro_id is specified (plan §5)
        if metro_id is not None and metro_walk_minutes is not None and metro_walk_minutes <= 0:
            raise SellerServiceError("Время до метро должно быть больше 0 минут")
        
        # Auto web credentials: login=Seller{tg_id}, password={tg_id}
        web_login = f"Seller{tg_id}"
        web_password = str(tg_id)
        password_hash = hash_password(web_password)

        # Create seller
        new_seller = Seller(
            seller_id=tg_id,
            shop_name=shop_name,
            description=description,
            city_id=city_id,
            district_id=district_id,
            map_url=map_url,
            metro_id=metro_id,
            metro_walk_minutes=metro_walk_minutes,
            delivery_type=delivery_type,
            delivery_price=delivery_price,
            placement_expired_at=placement_expired_at,
            max_orders=0,
            daily_limit_date=None,
            active_orders=0,
            pending_requests=0,
            web_login=web_login,
            web_password_hash=password_hash,
        )
        self.session.add(new_seller)
        
        await self.session.commit()
        return {"status": "ok", "web_login": web_login, "web_password": web_password}
    
    async def _ensure_city_exists(self, city_id: Optional[int]) -> None:
        """Ensure city record exists."""
        if city_id is not None:
            city = await self.session.get(City, city_id)
            if not city and city_id == 1:
                self.session.add(City(id=1, name="Москва"))
    
    async def _ensure_district_exists(
        self, 
        district_id: Optional[int], 
        city_id: Optional[int]
    ) -> None:
        """Ensure district record exists."""
        if district_id is not None:
            district = await self.session.get(District, district_id)
            if not district:
                district_names = {
                    1: "ЦАО", 2: "САО", 3: "СВАО", 4: "ВАО",
                    5: "ЮВАО", 6: "ЮАО", 7: "ЮЗАО", 8: "ЗАО",
                    9: "СЗАО", 10: "Зеленоградский", 
                    11: "Новомосковский", 12: "Троицкий",
                }
                self.session.add(District(
                    id=district_id,
                    city_id=city_id,
                    name=district_names.get(district_id, f"Округ {district_id}")
                ))
    
    async def update_field(
        self,
        tg_id: int,
        field: str,
        value: str
    ) -> Dict[str, str]:
        """Update a single seller field."""
        if field not in self.VALID_UPDATE_FIELDS:
            raise InvalidFieldError(field)
        
        user = await self.session.get(User, tg_id)
        seller = await self.session.get(Seller, tg_id)
        
        if not user or not seller:
            raise SellerNotFoundError(tg_id)
        
        # User fields
        if field == "fio":
            user.fio = value
        elif field == "phone":
            user.phone = value
        # Seller fields
        elif field == "shop_name":
            seller.shop_name = value
        elif field == "description":
            seller.description = value
        elif field == "map_url":
            seller.map_url = value
        elif field == "delivery_type":
            seller.delivery_type = value
        elif field == "delivery_price":
            seller.delivery_price = float(value) if value.replace('.', '', 1).isdigit() else 0.0
        elif field == "city_id":
            seller.city_id = int(value) if value.isdigit() else None
        elif field == "district_id":
            seller.district_id = int(value) if value.isdigit() else None
        elif field == "metro_id":
            seller.metro_id = int(value) if value.isdigit() else None
        elif field == "metro_walk_minutes":
            new_val = int(value) if value.isdigit() else None
            if new_val is not None and new_val <= 0 and seller.metro_id is not None:
                raise SellerServiceError("Время до метро должно быть больше 0 минут")
            seller.metro_walk_minutes = new_val
        elif field == "placement_expired_at":
            value_stripped = (value or "").strip()
            if not value_stripped or value_stripped.lower() in ("null", "none", "-"):
                seller.placement_expired_at = None
            else:
                # Accept YYYY-MM-DD or DD.MM.YYYY
                try:
                    if "-" in value_stripped:
                        # YYYY-MM-DD
                        seller.placement_expired_at = datetime.strptime(value_stripped[:10], "%Y-%m-%d")
                    else:
                        # DD.MM.YYYY
                        parts = value_stripped.split(".")
                        if len(parts) == 3:
                            d, m, y = int(parts[0]), int(parts[1]), int(parts[2])
                            seller.placement_expired_at = datetime(y, m, d)
                        else:
                            raise SellerServiceError("Дата должна быть в формате ДД.ММ.ГГГГ или ГГГГ-ММ-ДД")
                except (ValueError, IndexError) as e:
                    raise SellerServiceError(f"Неверный формат даты: {e}")

        await self.session.commit()
        return {"status": "ok"}
    
    async def block_seller(self, tg_id: int, is_blocked: bool) -> Dict[str, str]:
        """Block or unblock a seller."""
        seller = await self.session.get(Seller, tg_id)
        if not seller:
            raise SellerNotFoundError(tg_id)
        
        seller.is_blocked = is_blocked
        await self.session.commit()
        return {"status": "ok"}
    
    async def soft_delete(self, tg_id: int) -> Dict[str, str]:
        """
        Soft delete a seller (hide from public lists).
        Sets deleted_at timestamp, changes user role to BUYER.
        """
        seller = await self.session.get(Seller, tg_id)
        if not seller:
            raise SellerNotFoundError(tg_id)
        
        seller.deleted_at = datetime.utcnow()
        
        user = await self.session.get(User, tg_id)
        if user and user.role != 'ADMIN':
            user.role = 'BUYER'
        
        await self.session.commit()
        return {"status": "ok", "message": "Продавец скрыт (soft delete)"}
    
    async def restore(self, tg_id: int) -> Dict[str, str]:
        """Restore a soft-deleted seller."""
        seller = await self.session.get(Seller, tg_id)
        if not seller:
            raise SellerNotFoundError(tg_id)
        
        if not seller.deleted_at:
            return {"status": "not_deleted", "message": "Продавец не был удален"}
        
        seller.deleted_at = None
        
        user = await self.session.get(User, tg_id)
        if user and user.role == 'BUYER':
            user.role = 'SELLER'
        
        await self.session.commit()
        return {"status": "ok", "message": "Продавец восстановлен"}
    
    async def hard_delete(self, tg_id: int) -> Dict[str, str]:
        """
        Hard delete a seller. Order history is preserved.
        Changes user role to BUYER.
        """
        seller = await self.session.get(Seller, tg_id)
        if not seller:
            raise SellerNotFoundError(tg_id)
        
        user = await self.session.get(User, tg_id)
        if user and user.role != 'ADMIN':
            user.role = 'BUYER'
        
        await self.session.delete(seller)
        await self.session.commit()
        return {"status": "ok"}
    
    async def reset_counters(self, tg_id: int) -> Dict[str, str]:
        """Reset seller order counters."""
        seller = await self.session.get(Seller, tg_id)
        if not seller:
            raise SellerNotFoundError(tg_id)
        
        seller.active_orders = 0
        seller.pending_requests = 0
        await self.session.commit()
        return {"status": "ok", "message": "Счетчики сброшены"}
    
    async def set_order_limit(self, tg_id: int, max_orders: int) -> Dict[str, Any]:
        """Установить дневной лимит заказов продавца (админ). 0 = сбросить на сегодня."""
        if max_orders < 0 or max_orders > 1000:
            raise SellerServiceError("Лимит должен быть от 0 до 1000")
        
        seller = await self.session.get(Seller, tg_id)
        if not seller:
            raise SellerNotFoundError(tg_id)
        
        today = _today_6am_date()
        seller.max_orders = max_orders
        seller.daily_limit_date = today if max_orders > 0 else None
        await self.session.commit()
        return {"status": "ok", "max_orders": max_orders}
    
    async def change_web_credentials(
        self,
        seller_id: int,
        old_login: str,
        old_password: str,
        new_login: str,
        new_password: str,
    ) -> Dict[str, str]:
        """Change web login/password. Verify old credentials first."""
        result = await self.session.execute(
            select(Seller).where(Seller.seller_id == seller_id)
        )
        seller = result.scalar_one_or_none()
        if not seller:
            raise SellerNotFoundError(seller_id)
        if not seller.web_login or not seller.web_password_hash:
            raise SellerServiceError("Учётные данные для веб-панели не установлены")
        if seller.web_login != old_login:
            raise SellerServiceError("Неверный текущий логин")
        if not verify_password(old_password, seller.web_password_hash):
            raise SellerServiceError("Неверный текущий пароль")
        new_login_stripped = (new_login or "").strip()
        if not new_login_stripped or len(new_login_stripped) < 3:
            raise SellerServiceError("Новый логин должен быть не менее 3 символов")
        if not new_password or len(new_password) < 4:
            raise SellerServiceError("Новый пароль должен быть не менее 4 символов")
        # Check login uniqueness (excluding current seller)
        dup = await self.session.execute(
            select(Seller).where(Seller.web_login == new_login_stripped, Seller.seller_id != seller_id)
        )
        if dup.scalar_one_or_none():
            raise SellerServiceError("Такой логин уже занят")
        seller.web_login = new_login_stripped
        seller.web_password_hash = hash_password(new_password)
        await self.session.commit()
        return {"status": "ok"}

    async def update_limits(self, tg_id: int, max_orders: int) -> Dict[str, Any]:
        """Обновить дневной лимит продавца (1-100). Применяется к текущему дню (до 6:00 следующего)."""
        if max_orders < 1 or max_orders > 100:
            raise SellerServiceError("Лимит должен быть от 1 до 100")
        
        result = await self.session.execute(
            select(Seller).where(Seller.seller_id == tg_id)
        )
        seller = result.scalar_one_or_none()
        
        if not seller:
            raise SellerNotFoundError(tg_id)
        
        today = _today_6am_date()
        seller.max_orders = max_orders
        seller.daily_limit_date = today
        await self.session.commit()
        return {"status": "ok", "max_orders": max_orders}
    
    async def list_all(self, include_deleted: bool = False) -> List[Dict[str, Any]]:
        """List all sellers with optional deleted filter."""
        conditions = []
        if not include_deleted:
            conditions.append(Seller.deleted_at.is_(None))
        
        query = select(User, Seller).join(Seller, User.tg_id == Seller.seller_id)
        if conditions:
            query = query.where(*conditions)
        
        result = await self.session.execute(query)
        
        return [
            {
                "tg_id": user.tg_id,
                "fio": user.fio,
                "phone": user.phone,
                "shop_name": seller.shop_name,
                "description": seller.description,
                "district_id": seller.district_id,
                "map_url": seller.map_url,
                "metro_id": seller.metro_id,
                "metro_walk_minutes": seller.metro_walk_minutes,
                "delivery_type": seller.delivery_type,
                "delivery_price": float(seller.delivery_price) if seller.delivery_price is not None else 0.0,
                "max_orders": seller.max_orders,
                "daily_limit_date": seller.daily_limit_date.isoformat() if seller.daily_limit_date else None,
                "placement_expired_at": seller.placement_expired_at.isoformat() if seller.placement_expired_at else None,
                "is_blocked": seller.is_blocked,
                "is_deleted": seller.deleted_at is not None,
                "deleted_at": seller.deleted_at.isoformat() if seller.deleted_at else None
            }
            for user, seller in result.all()
        ]
    
    async def search(
        self, 
        fio: str, 
        include_deleted: bool = False
    ) -> List[Dict[str, Any]]:
        """Search sellers by name."""
        conditions = [User.fio.ilike(f"%{fio}%")]
        
        if not include_deleted:
            conditions.append(Seller.deleted_at.is_(None))
        
        result = await self.session.execute(
            select(User, Seller)
            .join(Seller, User.tg_id == Seller.seller_id)
            .where(*conditions)
        )
        
        return [
            {
                "tg_id": user.tg_id,
                "fio": user.fio,
                "phone": user.phone,
                "shop_name": seller.shop_name,
                "description": seller.description,
                "district_id": seller.district_id,
                "map_url": seller.map_url,
                "metro_id": seller.metro_id,
                "metro_walk_minutes": seller.metro_walk_minutes,
                "delivery_type": seller.delivery_type,
                "delivery_price": float(seller.delivery_price) if seller.delivery_price is not None else 0.0,
                "max_orders": seller.max_orders,
                "daily_limit_date": seller.daily_limit_date.isoformat() if seller.daily_limit_date else None,
                "placement_expired_at": seller.placement_expired_at.isoformat() if seller.placement_expired_at else None,
                "is_blocked": seller.is_blocked,
                "is_deleted": seller.deleted_at is not None,
                "deleted_at": seller.deleted_at.isoformat() if seller.deleted_at else None
            }
            for user, seller in result.all()
        ]
    
    async def get_cities(self) -> List[Dict[str, Any]]:
        """Get list of all cities."""
        result = await self.session.execute(select(City))
        cities = result.scalars().all()
        return [{"id": c.id, "name": c.name} for c in cities]
    
    async def get_districts(self, city_id: int) -> List[Dict[str, Any]]:
        """Get districts for a city."""
        result = await self.session.execute(
            select(District).where(District.city_id == city_id)
        )
        districts = result.scalars().all()
        return [{"id": d.id, "name": d.name} for d in districts]
    
    # Статусы заказов, считающиеся «выполненными» для статистики (бот ставит "done")
    COMPLETED_ORDER_STATUSES = ('done', 'completed', 'delivered')

    async def get_all_stats(
        self,
        commission_percent: int = 18,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> List[Dict[str, Any]]:
        """Get statistics for all sellers (optionally filtered by order date)."""
        conditions = [Order.status.in_(self.COMPLETED_ORDER_STATUSES)]
        if date_from is not None:
            conditions.append(Order.created_at >= date_from)
        if date_to is not None:
            conditions.append(Order.created_at <= date_to)
        result = await self.session.execute(
            select(
                User.fio,
                func.count(Order.id).label('orders_count'),
                func.sum(Order.total_price).label('total_sales')
            )
            .join(Order, User.tg_id == Order.seller_id)
            .where(*conditions)
            .group_by(User.fio)
        )
        
        stats = []
        for row in result.all():
            total_sales = float(row.total_sales) if row.total_sales else 0.0
            platform_profit = total_sales * (commission_percent / 100)
            stats.append({
                "fio": row.fio,
                "orders_count": row.orders_count,
                "total_sales": total_sales,
                "platform_profit": platform_profit
            })
        
        return stats
    
    async def get_seller_stats_by_fio(
        self, 
        fio: str, 
        commission_percent: int = 18
    ) -> Optional[Dict[str, Any]]:
        """Get statistics for a specific seller by name (completed orders only)."""
        result = await self.session.execute(
            select(
                User.fio,
                func.count(Order.id).label('orders_count'),
                func.sum(Order.total_price).label('total_sales')
            )
            .join(Order, User.tg_id == Order.seller_id)
            .where(
                Order.status.in_(self.COMPLETED_ORDER_STATUSES),
                User.fio.ilike(f"%{fio}%")
            )
            .group_by(User.fio)
        )
        
        row = result.first()
        if not row:
            return None
        
        total_sales = float(row.total_sales) if row.total_sales else 0.0
        platform_profit = total_sales * (commission_percent / 100)
        
        return {
            "fio": row.fio,
            "orders_count": row.orders_count,
            "total_sales": total_sales,
            "platform_profit": platform_profit
        }


# Legacy functions for backward compatibility
async def check_seller_limit(session: AsyncSession, seller_id: int) -> bool:
    """Legacy function - use SellerService.check_limit instead."""
    service = SellerService(session)
    return await service.check_limit(seller_id)


async def get_seller_data(session: AsyncSession, seller_id: int):
    """Legacy function - use SellerService.get_seller instead."""
    service = SellerService(session)
    return await service.get_seller(seller_id)