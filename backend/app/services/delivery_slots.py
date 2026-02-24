"""Delivery time slot service — generate available slots and validate bookings."""

from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.order import Order
from backend.app.models.seller import Seller

MSK = ZoneInfo("Europe/Moscow")
DEFAULT_SLOT_DURATION = 120
ALLOWED_DURATIONS = (60, 90, 120, 180)

# Statuses that occupy a slot (everything except rejected/cancelled)
CANCELLED_STATUSES = ("rejected", "cancelled")


class DeliverySlotService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_available_slots(
        self,
        seller_id: int,
        date_from: date,
        date_to: date,
    ) -> dict:
        """
        Return available delivery slots for a seller in a date range.

        Returns:
            {
                "slots_enabled": bool,
                "slot_duration_minutes": 120,
                "slots": {
                    "2026-02-25": [{"start": "10:00", "end": "12:00", "available": 2}, ...],
                    ...
                }
            }
        """
        seller = await self.session.get(Seller, seller_id)
        if not seller or not seller.deliveries_per_slot:
            return {"slots_enabled": False, "slot_duration_minutes": DEFAULT_SLOT_DURATION, "slots": {}}

        capacity = seller.deliveries_per_slot
        working_hours = seller.working_hours
        min_lead = seller.min_slot_lead_minutes or 120
        slot_duration = seller.slot_duration_minutes if seller.slot_duration_minutes in ALLOWED_DURATIONS else DEFAULT_SLOT_DURATION
        now_msk = datetime.now(MSK)

        # Clamp date range to seller's slot_days_ahead
        max_date = now_msk.date() + timedelta(days=seller.slot_days_ahead or 3)
        if date_to > max_date:
            date_to = max_date
        if date_from < now_msk.date():
            date_from = now_msk.date()

        # Generate all possible slots for the date range
        all_slots: dict[str, list[dict]] = {}
        current = date_from
        while current <= date_to:
            day_slots = self._generate_day_slots(current, working_hours, now_msk, min_lead, slot_duration)
            if day_slots:
                all_slots[current.isoformat()] = day_slots
            current += timedelta(days=1)

        if not all_slots:
            return {"slots_enabled": True, "slot_duration_minutes": slot_duration, "slots": {}}

        # Batch query: count booked orders per slot
        booked_counts = await self._get_booked_counts(seller_id, date_from, date_to)

        # Filter out full slots
        result: dict[str, list[dict]] = {}
        for day_str, slots in all_slots.items():
            available = []
            for slot in slots:
                key = (day_str, slot["start"])
                booked = booked_counts.get(key, 0)
                remaining = capacity - booked
                if remaining > 0:
                    available.append({
                        "start": slot["start"],
                        "end": slot["end"],
                        "available": remaining,
                    })
            if available:
                result[day_str] = available

        return {"slots_enabled": True, "slot_duration_minutes": slot_duration, "slots": result}

    async def validate_slot(
        self,
        seller: Seller,
        slot_date: date,
        slot_start: str,
        slot_end: str,
    ) -> bool:
        """
        Check if a specific slot is still available.
        Must be called inside a transaction with seller FOR UPDATE lock.
        """
        if not seller.deliveries_per_slot:
            return False

        capacity = seller.deliveries_per_slot
        booked = await self._count_booked_single(seller.seller_id, slot_date, slot_start)
        return booked < capacity

    async def _count_booked_single(
        self, seller_id: int, slot_date: date, slot_start: str
    ) -> int:
        """Count active orders for a single slot."""
        result = await self.session.execute(
            select(func.count(Order.id)).where(
                Order.seller_id == seller_id,
                Order.delivery_slot_date == slot_date,
                Order.delivery_slot_start == slot_start,
                Order.status.notin_(CANCELLED_STATUSES),
            )
        )
        return result.scalar() or 0

    async def _get_booked_counts(
        self, seller_id: int, date_from: date, date_to: date
    ) -> dict[tuple[str, str], int]:
        """Batch count of booked orders per (date, slot_start)."""
        result = await self.session.execute(
            select(
                Order.delivery_slot_date,
                Order.delivery_slot_start,
                func.count(Order.id),
            )
            .where(
                Order.seller_id == seller_id,
                Order.delivery_slot_date.between(date_from, date_to),
                Order.delivery_slot_start.isnot(None),
                Order.status.notin_(CANCELLED_STATUSES),
            )
            .group_by(Order.delivery_slot_date, Order.delivery_slot_start)
        )
        counts: dict[tuple[str, str], int] = {}
        for row in result.all():
            slot_date_val, slot_start_val, cnt = row
            if slot_date_val and slot_start_val:
                counts[(slot_date_val.isoformat(), slot_start_val)] = cnt
        return counts

    def _generate_day_slots(
        self,
        day: date,
        working_hours: Optional[dict],
        now_msk: datetime,
        min_lead_minutes: int,
        slot_duration: int = DEFAULT_SLOT_DURATION,
    ) -> list[dict]:
        """Generate time slots for a given day based on working hours."""
        if not working_hours or not isinstance(working_hours, dict):
            return []

        weekday = day.weekday()  # 0=Mon, 6=Sun
        day_config = working_hours.get(str(weekday))

        if day_config is None:
            return []  # Day off
        if not isinstance(day_config, dict):
            return []

        open_time = day_config.get("open")
        close_time = day_config.get("close")
        if not open_time or not close_time:
            return []

        try:
            open_h, open_m = map(int, open_time.split(":"))
            close_h, close_m = map(int, close_time.split(":"))
        except (ValueError, TypeError):
            return []

        open_minutes = open_h * 60 + open_m
        close_minutes = close_h * 60 + close_m

        # First slot starts after opening + preparation time (min_lead applies to all days)
        earliest_slot_start = open_minutes + min_lead_minutes

        # For today: also consider current time + min_lead
        is_today = day == now_msk.date()
        if is_today:
            now_cutoff = now_msk.hour * 60 + now_msk.minute + min_lead_minutes
            earliest_slot_start = max(earliest_slot_start, now_cutoff)

        # Align earliest_slot_start to slot grid (snap to next slot boundary from open)
        if earliest_slot_start > open_minutes:
            slots_to_skip = (earliest_slot_start - open_minutes + slot_duration - 1) // slot_duration
            aligned_start = open_minutes + slots_to_skip * slot_duration
        else:
            aligned_start = open_minutes

        slots = []
        current_start = aligned_start
        while current_start + slot_duration <= close_minutes:
            slot_end = current_start + slot_duration

            start_str = f"{current_start // 60:02d}:{current_start % 60:02d}"
            end_str = f"{slot_end // 60:02d}:{slot_end % 60:02d}"
            slots.append({"start": start_str, "end": end_str})
            current_start = slot_end

        return slots
