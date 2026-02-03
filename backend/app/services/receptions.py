"""Flowers catalog, receptions and reception items (CRM intake)."""
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models.crm import Flower, Reception, ReceptionItem


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
    result = await session.execute(
        select(Reception)
        .where(Reception.seller_id == seller_id)
        .order_by(Reception.reception_date.desc().nullslast(), Reception.id.desc())
    )
    receptions = result.scalars().all()
    out = []
    for r in receptions:
        out.append({
            "id": r.id,
            "name": r.name,
            "reception_date": r.reception_date.isoformat() if r.reception_date else None,
        })
    return out


async def create_reception(
    session: AsyncSession, seller_id: int, name: str, reception_date: Optional[date] = None
) -> Reception:
    rec = Reception(
        seller_id=seller_id,
        name=name,
        reception_date=reception_date,
    )
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    return rec


async def get_reception(
    session: AsyncSession, reception_id: int, seller_id: int
) -> Optional[Dict[str, Any]]:
    result = await session.execute(
        select(Reception)
        .where(Reception.id == reception_id, Reception.seller_id == seller_id)
        .options(selectinload(Reception.items))
    )
    rec = result.scalar_one_or_none()
    if not rec:
        return None
    today = date.today()
    items = []
    for item in rec.items or []:
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
        "id": rec.id,
        "name": rec.name,
        "reception_date": rec.reception_date.isoformat() if rec.reception_date else None,
        "items": items,
    }


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
    if rec_result.scalar_one_or_none() is None:
        return None
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
