"""Flowers catalog, receptions and reception items (CRM intake)."""
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models.crm import Flower, Reception, ReceptionItem


class ReceptionClosedError(Exception):
    """Raised when trying to add item to a closed reception."""
    def __init__(self):
        super().__init__("Приёмка закрыта. Новые позиции добавлять нельзя.")


async def list_flowers(session: AsyncSession, seller_id: int) -> List[Flower]:
    result = await session.execute(
        select(Flower).where(Flower.seller_id == seller_id).order_by(Flower.name)
    )
    return list(result.scalars().all())


async def create_flower(
    session: AsyncSession,
    seller_id: int,
    name: str,
    default_shelf_life_days: Optional[int] = None,
) -> Flower:
    flower = Flower(
        seller_id=seller_id,
        name=name,
        default_shelf_life_days=default_shelf_life_days,
    )
    session.add(flower)
    await session.commit()
    await session.refresh(flower)
    return flower


async def delete_flower(
    session: AsyncSession, flower_id: int, seller_id: int
) -> bool:
    result = await session.execute(
        select(Flower).where(Flower.id == flower_id, Flower.seller_id == seller_id)
    )
    flower = result.scalar_one_or_none()
    if not flower:
        return False
    await session.delete(flower)
    await session.commit()
    return True


async def list_receptions(
    session: AsyncSession, seller_id: int
) -> List[Dict[str, Any]]:
    # Load real is_closed, supplier, invoice_number from database
    result = await session.execute(
        select(Reception.id, Reception.name, Reception.reception_date,
               Reception.is_closed, Reception.supplier, Reception.invoice_number)
        .where(Reception.seller_id == seller_id)
        .order_by(Reception.reception_date.desc().nullslast(), Reception.id.desc())
    )
    rows = result.all()
    return [
        {
            "id": row[0],
            "name": row[1],
            "reception_date": row[2].isoformat() if row[2] else None,
            "is_closed": getattr(row, 'is_closed', row[3]) if len(row) > 3 else False,
            "supplier": getattr(row, 'supplier', row[4]) if len(row) > 4 else None,
            "invoice_number": getattr(row, 'invoice_number', row[5]) if len(row) > 5 else None,
        }
        for row in rows
    ]


async def create_reception(
    session: AsyncSession,
    seller_id: int,
    name: str,
    reception_date: Optional[date] = None,
    supplier: Optional[str] = None,
    invoice_number: Optional[str] = None,
) -> Reception:
    rec = Reception(
        seller_id=seller_id,
        name=name,
        reception_date=reception_date,
        is_closed=False,
        supplier=supplier,
        invoice_number=invoice_number,
    )
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    return rec


async def get_reception(
    session: AsyncSession, reception_id: int, seller_id: int
) -> Optional[Dict[str, Any]]:
    # Load reception header with real is_closed, supplier, invoice_number
    rec_result = await session.execute(
        select(Reception.id, Reception.name, Reception.reception_date,
               Reception.is_closed, Reception.supplier, Reception.invoice_number)
        .where(Reception.id == reception_id, Reception.seller_id == seller_id)
    )
    rec_row = rec_result.one_or_none()
    if not rec_row:
        return None
    rec_id, rec_name, rec_date = rec_row[0], rec_row[1], rec_row[2]
    rec_is_closed = rec_row[3] if len(rec_row) > 3 else False
    rec_supplier = rec_row[4] if len(rec_row) > 4 else None
    rec_invoice_number = rec_row[5] if len(rec_row) > 5 else None
    # Load items for this reception (ReceptionItem has no new columns)
    items_result = await session.execute(
        select(ReceptionItem)
        .where(ReceptionItem.reception_id == reception_id)
    )
    rec_items = items_result.scalars().all()
    today = date.today()
    items = []
    for item in rec_items:
        flower_result = await session.execute(select(Flower).where(Flower.id == item.flower_id))
        flower = flower_result.scalar_one_or_none()
        flower_name = flower.name if flower else str(item.flower_id)
        arrival = item.arrival_date
        days_left = None
        if arrival is not None:
            expiry = arrival + timedelta(days=item.shelf_life_days)
            days_left = (expiry - today).days
        items.append({
            "id": item.id,
            "flower_id": item.flower_id,
            "flower_name": flower_name,
            "quantity_initial": item.quantity_initial,
            "arrival_date": arrival.isoformat() if arrival else None,
            "shelf_life_days": item.shelf_life_days,
            "price_per_unit": float(item.price_per_unit),
            "remaining_quantity": item.remaining_quantity,
            "sold_quantity": item.sold_quantity,
            "sold_amount": float(item.sold_amount),
            "days_left": days_left,
        })
    return {
        "id": rec_id,
        "name": rec_name,
        "reception_date": rec_date.isoformat() if rec_date else None,
        "is_closed": rec_is_closed,
        "supplier": rec_supplier,
        "invoice_number": rec_invoice_number,
        "items": items,
    }


async def update_reception(
    session: AsyncSession,
    reception_id: int,
    seller_id: int,
    *,
    is_closed: Optional[bool] = None,
    supplier: Optional[str] = None,
    invoice_number: Optional[str] = None,
) -> Optional[Reception]:
    result = await session.execute(
        select(Reception).where(
            Reception.id == reception_id, Reception.seller_id == seller_id
        )
    )
    rec = result.scalar_one_or_none()
    if not rec:
        return None
    if is_closed is not None:
        rec.is_closed = is_closed
    if supplier is not None:
        rec.supplier = supplier
    if invoice_number is not None:
        rec.invoice_number = invoice_number
    await session.commit()
    await session.refresh(rec)
    return rec


async def add_reception_item(
    session: AsyncSession,
    reception_id: int,
    seller_id: int,
    flower_id: int,
    quantity_initial: int,
    arrival_date: Optional[date],
    shelf_life_days: int,
    price_per_unit: float,
) -> Optional[ReceptionItem]:
    rec_result = await session.execute(
        select(Reception).where(
            Reception.id == reception_id, Reception.seller_id == seller_id
        )
    )
    rec = rec_result.scalar_one_or_none()
    if rec is None:
        return None
    if getattr(rec, "is_closed", False):
        raise ReceptionClosedError()
    flower_result = await session.execute(
        select(Flower).where(Flower.id == flower_id, Flower.seller_id == seller_id)
    )
    if flower_result.scalar_one_or_none() is None:
        return None
    item = ReceptionItem(
        reception_id=reception_id,
        flower_id=flower_id,
        quantity_initial=quantity_initial,
        arrival_date=arrival_date,
        shelf_life_days=shelf_life_days,
        price_per_unit=Decimal(str(price_per_unit)),
        remaining_quantity=quantity_initial,
        sold_quantity=0,
        sold_amount=Decimal("0"),
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


async def update_reception_item(
    session: AsyncSession,
    item_id: int,
    seller_id: int,
    **kwargs: Any,
) -> Optional[ReceptionItem]:
    result = await session.execute(
        select(ReceptionItem)
        .join(Reception, ReceptionItem.reception_id == Reception.id)
        .where(ReceptionItem.id == item_id, Reception.seller_id == seller_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        return None
    allowed = {
        "remaining_quantity",
        "quantity_initial",
        "arrival_date",
        "shelf_life_days",
        "price_per_unit",
    }
    for k, v in kwargs.items():
        if k in allowed and v is not None:
            if k == "price_per_unit":
                setattr(item, k, Decimal(str(v)))
            else:
                setattr(item, k, v)
    await session.commit()
    await session.refresh(item)
    return item


async def delete_reception_item(
    session: AsyncSession, item_id: int, seller_id: int
) -> bool:
    result = await session.execute(
        select(ReceptionItem)
        .join(Reception, ReceptionItem.reception_id == Reception.id)
        .where(ReceptionItem.id == item_id, Reception.seller_id == seller_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        return False
    await session.delete(item)
    await session.commit()
    return True


def _reception_item_to_dict(item: ReceptionItem, flower_name: str) -> Dict[str, Any]:
    today = date.today()
    arrival = item.arrival_date
    days_left = None
    if arrival is not None:
        expiry = arrival + timedelta(days=item.shelf_life_days)
        days_left = (expiry - today).days
    return {
        "id": item.id,
        "flower_id": item.flower_id,
        "flower_name": flower_name,
        "quantity_initial": item.quantity_initial,
        "arrival_date": arrival.isoformat() if arrival else None,
        "shelf_life_days": item.shelf_life_days,
        "price_per_unit": float(item.price_per_unit),
        "remaining_quantity": item.remaining_quantity,
        "sold_quantity": item.sold_quantity,
        "sold_amount": float(item.sold_amount),
        "days_left": days_left,
    }


async def get_expiring_items(
    session: AsyncSession, seller_id: int, days_left_max: int = 2
) -> List[Dict[str, Any]]:
    """Return reception items with days_left <= days_left_max (for dashboard alerts)."""
    result = await session.execute(
        select(ReceptionItem, Flower.name, Reception.name.label("reception_name"))
        .join(Flower, ReceptionItem.flower_id == Flower.id)
        .join(Reception, ReceptionItem.reception_id == Reception.id)
        .where(Reception.seller_id == seller_id, ReceptionItem.remaining_quantity > 0)
    )
    rows = result.all()
    today = date.today()
    out = []
    for item, flower_name, reception_name in rows:
        arrival = item.arrival_date
        if arrival is None:
            continue
        expiry = arrival + timedelta(days=item.shelf_life_days)
        days_left = (expiry - today).days
        if days_left <= days_left_max:
            out.append({
                "reception_id": item.reception_id,
                "reception_name": reception_name,
                "flower_name": flower_name,
                "days_left": days_left,
                "remaining_quantity": item.remaining_quantity,
            })
    return out


async def get_reception_items_for_inventory(
    session: AsyncSession, reception_id: int, seller_id: int
) -> List[Dict[str, Any]]:
    result = await session.execute(
        select(ReceptionItem, Flower.name)
        .join(Flower, ReceptionItem.flower_id == Flower.id)
        .join(Reception, ReceptionItem.reception_id == Reception.id)
        .where(
            Reception.id == reception_id,
            Reception.seller_id == seller_id,
        )
    )
    rows = result.all()
    today = date.today()
    out = []
    for item, flower_name in rows:
        arrival = item.arrival_date
        days_left = None
        if arrival is not None:
            expiry = arrival + timedelta(days=item.shelf_life_days)
            days_left = (expiry - today).days
        out.append({
            "id": item.id,
            "flower_id": item.flower_id,
            "flower_name": flower_name,
            "remaining_quantity": item.remaining_quantity,
            "price_per_unit": float(item.price_per_unit),
            "days_left": days_left,
        })
    return out


async def inventory_check(
    session: AsyncSession,
    reception_id: int,
    seller_id: int,
    lines: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """lines: [{"reception_item_id": int, "actual_quantity": int}, ...]. Returns differences and total loss."""
    items = await get_reception_items_for_inventory(session, reception_id, seller_id)
    by_id = {it["id"]: it for it in items}
    results = []
    total_loss = Decimal("0")
    for line in lines:
        item_id = line.get("reception_item_id") or line.get("id")
        actual = int(line.get("actual_quantity", 0))
        if item_id not in by_id:
            continue
        it = by_id[item_id]
        system_qty = it["remaining_quantity"]
        diff = actual - system_qty
        loss = Decimal("0")
        if diff < 0:
            loss = abs(diff) * Decimal(str(it["price_per_unit"]))
            total_loss += loss
        results.append({
            "reception_item_id": item_id,
            "flower_name": it["flower_name"],
            "system_quantity": system_qty,
            "actual_quantity": actual,
            "difference": diff,
            "loss_amount": float(loss),
        })
    return {"lines": results, "total_loss": float(total_loss)}


async def inventory_apply(
    session: AsyncSession,
    reception_id: int,
    seller_id: int,
    lines: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Apply actual quantities to reception items. lines: [{"reception_item_id": int, "actual_quantity": int}, ...].
    Updates remaining_quantity to actual_quantity for each line. Returns applied count."""
    rec_result = await get_reception(session, reception_id, seller_id)
    if not rec_result:
        return {"applied": 0, "error": "reception_not_found"}
    items = await get_reception_items_for_inventory(session, reception_id, seller_id)
    by_id = {it["id"]: it for it in items}
    applied = 0
    for line in lines:
        item_id = line.get("reception_item_id") or line.get("id")
        actual = int(line.get("actual_quantity", 0))
        if item_id not in by_id:
            continue
        result = await session.execute(
            select(ReceptionItem)
            .where(ReceptionItem.id == item_id, ReceptionItem.reception_id == reception_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            continue
        item.remaining_quantity = actual
        applied += 1
    return {"applied": applied}
