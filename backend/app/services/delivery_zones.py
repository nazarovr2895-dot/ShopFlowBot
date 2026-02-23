"""Delivery zone management and matching service."""
from decimal import Decimal
from typing import List, Dict, Any, Optional

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.delivery_zone import DeliveryZone
from backend.app.models.seller import Seller, District


class DeliveryZoneService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_zones(self, seller_id: int) -> List[Dict[str, Any]]:
        """Get all delivery zones for a seller, ordered by priority."""
        result = await self.session.execute(
            select(DeliveryZone)
            .where(DeliveryZone.seller_id == seller_id)
            .order_by(DeliveryZone.priority, DeliveryZone.id)
        )
        zones = result.scalars().all()
        return [self._zone_to_dict(z) for z in zones]

    async def get_active_zones(self, seller_id: int) -> List[Dict[str, Any]]:
        """Get only active delivery zones for a seller."""
        result = await self.session.execute(
            select(DeliveryZone)
            .where(DeliveryZone.seller_id == seller_id, DeliveryZone.is_active == True)
            .order_by(DeliveryZone.priority, DeliveryZone.id)
        )
        zones = result.scalars().all()
        return [self._zone_to_dict(z) for z in zones]

    async def create_zone(self, seller_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new delivery zone."""
        zone = DeliveryZone(
            seller_id=seller_id,
            name=data["name"],
            district_ids=data.get("district_ids") or [],
            delivery_price=data.get("delivery_price", 0),
            min_order_amount=data.get("min_order_amount"),
            free_delivery_from=data.get("free_delivery_from"),
            is_active=data.get("is_active", True),
            priority=data.get("priority", 0),
        )
        self.session.add(zone)
        await self.session.flush()
        return self._zone_to_dict(zone)

    async def update_zone(self, zone_id: int, seller_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update an existing delivery zone. Returns None if not found."""
        zone = await self._get_zone(zone_id, seller_id)
        if not zone:
            return None
        for field in ("name", "district_ids", "delivery_price", "min_order_amount", "free_delivery_from", "is_active", "priority"):
            if field in data:
                setattr(zone, field, data[field])
        await self.session.flush()
        return self._zone_to_dict(zone)

    async def delete_zone(self, zone_id: int, seller_id: int) -> bool:
        """Delete a delivery zone. Returns True if deleted."""
        zone = await self._get_zone(zone_id, seller_id)
        if not zone:
            return False
        await self.session.delete(zone)
        await self.session.flush()
        return True

    async def resolve_district_id(self, district_name: str) -> Optional[int]:
        """Resolve district name (e.g. 'ЦАО') to district ID."""
        result = await self.session.execute(
            select(District.id).where(District.name == district_name)
        )
        row = result.scalar_one_or_none()
        return row

    async def find_zone_for_address(
        self,
        seller_id: int,
        district_id: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Find the matching delivery zone for a buyer's district.
        Returns zone dict with delivery_price, or None if no zone matches.
        Zones are checked in priority order (lower = first).
        """
        if district_id is None:
            return None

        zones = await self.get_active_zones(seller_id)
        for zone in zones:
            zone_districts = zone.get("district_ids") or []
            if district_id in zone_districts:
                return zone
        return None

    async def check_delivery(
        self,
        seller_id: int,
        district_id: Optional[int] = None,
        district_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Check if seller delivers to the given district.
        Zones are always active — if seller has zones, use them;
        if not, fall back to flat delivery_price.
        Accepts district_id or district_name (resolved to ID internally).
        """
        seller = await self.session.get(Seller, seller_id)
        if not seller:
            return {"delivers": False, "zone": None, "delivery_price": 0, "message": "Магазин не найден"}

        # Check if seller has any active zones
        zones = await self.get_active_zones(seller_id)

        if not zones:
            # No zones configured → fallback to flat delivery price (backward compatible)
            return {
                "delivers": True,
                "zone": None,
                "delivery_price": float(seller.delivery_price or 0),
                "message": "",
            }

        # Seller has zones — resolve district
        if district_id is None and district_name:
            district_id = await self.resolve_district_id(district_name)

        if district_id is None:
            return {"delivers": False, "zone": None, "delivery_price": 0, "message": "Укажите адрес для проверки доставки"}

        zone = await self.find_zone_for_address(seller_id, district_id=district_id)
        if zone is None:
            return {"delivers": False, "zone": None, "delivery_price": 0, "message": "Магазин не доставляет по этому адресу"}

        return {
            "delivers": True,
            "zone": zone,
            "delivery_price": zone["delivery_price"],
            "message": "",
        }

    async def _get_zone(self, zone_id: int, seller_id: int) -> Optional[DeliveryZone]:
        result = await self.session.execute(
            select(DeliveryZone).where(
                DeliveryZone.id == zone_id,
                DeliveryZone.seller_id == seller_id,
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    def _zone_to_dict(zone: DeliveryZone) -> Dict[str, Any]:
        return {
            "id": zone.id,
            "seller_id": zone.seller_id,
            "name": zone.name,
            "district_ids": zone.district_ids or [],
            "delivery_price": float(zone.delivery_price or 0),
            "min_order_amount": float(zone.min_order_amount) if zone.min_order_amount is not None else None,
            "free_delivery_from": float(zone.free_delivery_from) if zone.free_delivery_from is not None else None,
            "is_active": zone.is_active,
            "priority": zone.priority,
        }
