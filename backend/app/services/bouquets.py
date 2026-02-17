"""Bouquet templates and cost calculation from reception stock."""
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models.crm import Bouquet, BouquetItem, Flower, Reception, ReceptionItem


async def check_bouquet_stock(
    session: AsyncSession, seller_id: int, bouquet_id: int, order_quantity: int
) -> Optional[str]:
    """Return error message if insufficient stock for bouquet * order_quantity, else None."""
    result = await session.execute(
        select(Bouquet)
        .where(Bouquet.id == bouquet_id, Bouquet.seller_id == seller_id)
        .options(selectinload(Bouquet.bouquet_items))
    )
    bouquet = result.scalar_one_or_none()
    if not bouquet or not bouquet.bouquet_items:
        return None
    for bi in bouquet.bouquet_items:
        need = bi.quantity * order_quantity
        if need <= 0:
            continue
        sum_result = await session.execute(
            select(func.coalesce(func.sum(ReceptionItem.remaining_quantity), 0))
            .join(Reception, ReceptionItem.reception_id == Reception.id)
            .where(
                Reception.seller_id == seller_id,
                ReceptionItem.flower_id == bi.flower_id,
            )
        )
        total = int(sum_result.scalar() or 0)
        if total < need:
            flower = await session.get(Flower, bi.flower_id)
            name = flower.name if flower else str(bi.flower_id)
            return f"Недостаточно цветов для букета '{bouquet.name}': '{name}' нужно {need}, в наличии {total}"
    return None


async def deduct_bouquet_from_receptions(
    session: AsyncSession,
    seller_id: int,
    bouquet_id: int,
    order_quantity: int,
) -> None:
    """
    Deduct bouquet composition from reception items (FIFO).
    Call check_bouquet_stock before this. Updates remaining_quantity, sold_quantity, sold_amount.
    """
    result = await session.execute(
        select(Bouquet)
        .where(Bouquet.id == bouquet_id, Bouquet.seller_id == seller_id)
        .options(selectinload(Bouquet.bouquet_items))
    )
    bouquet = result.scalar_one_or_none()
    if not bouquet or not bouquet.bouquet_items:
        return
    for bi in bouquet.bouquet_items:
        need = bi.quantity * order_quantity
        if need <= 0:
            continue
        # Get reception_items for this flower, seller, with remaining > 0, FIFO
        items_result = await session.execute(
            select(ReceptionItem)
            .join(Reception, ReceptionItem.reception_id == Reception.id)
            .where(
                Reception.seller_id == seller_id,
                ReceptionItem.flower_id == bi.flower_id,
                ReceptionItem.remaining_quantity > 0,
            )
            .order_by(ReceptionItem.arrival_date.asc().nullslast(), ReceptionItem.id.asc())
        )
        items = items_result.scalars().all()
        for ri in items:
            if need <= 0:
                break
            take = min(need, ri.remaining_quantity)
            if take <= 0:
                continue
            ri.remaining_quantity -= take
            ri.sold_quantity += take
            ri.sold_amount += Decimal(str(take)) * ri.price_per_unit
            need -= take
    # No commit here - caller (order service) commits


async def _flower_stock_and_avg_price(
    session: AsyncSession, seller_id: int
) -> Dict[int, Tuple[int, Decimal]]:
    """Return per flower_id: (total_remaining, weighted_avg_price)."""
    result = await session.execute(
        select(ReceptionItem)
        .join(Reception, ReceptionItem.reception_id == Reception.id)
        .where(
            Reception.seller_id == seller_id,
            ReceptionItem.remaining_quantity > 0,
        )
        .order_by(ReceptionItem.arrival_date.asc().nullslast())
    )
    items = result.scalars().all()
    by_flower: Dict[int, List[Tuple[int, Decimal]]] = {}
    for it in items:
        by_flower.setdefault(it.flower_id, []).append(
            (it.remaining_quantity, it.price_per_unit)
        )
    out: Dict[int, Tuple[int, Decimal]] = {}
    for flower_id, pairs in by_flower.items():
        total = sum(p[0] for p in pairs)
        if total <= 0:
            continue
        weighted = sum(p[0] * p[1] for p in pairs) / total
        out[flower_id] = (total, Decimal(str(weighted)))
    return out


def _can_assemble_count(
    stock: Dict[int, Tuple[int, Decimal]],
    bouquet_items: List[Any],  # list of BouquetItem-like with flower_id, quantity
) -> int:
    """Max number of such bouquets that can be assembled from current reception stock."""
    if not bouquet_items:
        return 0
    min_count: Optional[int] = None
    for bi in bouquet_items:
        have = stock.get(bi.flower_id, (0, Decimal("0")))[0]
        need_per = bi.quantity
        if need_per <= 0:
            continue
        n = have // need_per
        if min_count is None or n < min_count:
            min_count = n
    return min_count if min_count is not None else 0


async def get_active_bouquet_ids(session: AsyncSession, seller_id: int) -> set:
    """Return set of bouquet_ids for which at least 1 bouquet can be assembled (for mini app filtering)."""
    stock = await _flower_stock_and_avg_price(session, seller_id)
    result = await session.execute(
        select(Bouquet)
        .where(Bouquet.seller_id == seller_id)
        .options(selectinload(Bouquet.bouquet_items))
    )
    bouquets = result.scalars().all()
    active = set()
    for b in bouquets:
        if not b.bouquet_items:
            continue
        n = _can_assemble_count(stock, b.bouquet_items)
        if n >= 1:
            active.add(b.id)
    return active


async def sync_bouquet_product_quantities(
    session: AsyncSession, seller_id: int
) -> int:
    """Recalculate Product.quantity, cost_price and price for all bouquet-linked products.

    For each product with a bouquet_id, sets quantity = can_assemble_count
    based on current reception stock.  Also refreshes cost_price and
    (if markup_percent is set) recalculates price.

    Does NOT commit — caller is responsible for committing.
    Returns the number of products actually updated.
    """
    from backend.app.models.product import Product

    stock = await _flower_stock_and_avg_price(session, seller_id)

    # Load all bouquets with items for this seller
    bq_result = await session.execute(
        select(Bouquet)
        .where(Bouquet.seller_id == seller_id)
        .options(selectinload(Bouquet.bouquet_items))
    )
    bouquets = bq_result.scalars().all()
    bouquet_map = {b.id: b for b in bouquets}

    # Load all products linked to bouquets
    pr_result = await session.execute(
        select(Product).where(
            Product.seller_id == seller_id,
            Product.bouquet_id.isnot(None),
        )
    )
    products = pr_result.scalars().all()

    updated = 0
    for product in products:
        bouquet = bouquet_map.get(product.bouquet_id)
        if not bouquet or not bouquet.bouquet_items:
            continue

        new_qty = _can_assemble_count(stock, bouquet.bouquet_items)

        # Calculate cost price (flowers + packaging)
        total_cost = Decimal("0")
        for bi in bouquet.bouquet_items:
            _, avg = stock.get(bi.flower_id, (0, Decimal("0")))
            total_cost += avg * bi.quantity
        total_price_cost = float(total_cost + bouquet.packaging_cost)

        changed = False
        if product.quantity != new_qty:
            product.quantity = new_qty
            changed = True
        if product.cost_price != total_price_cost:
            product.cost_price = total_price_cost
            changed = True
        if product.markup_percent is not None and total_price_cost > 0:
            new_price = round(total_price_cost * (1 + float(product.markup_percent) / 100), 2)
            if product.price != new_price:
                product.price = new_price
                changed = True
        if changed:
            updated += 1

    return updated


async def list_bouquets_with_totals(
    session: AsyncSession, seller_id: int
) -> List[Dict[str, Any]]:
    result = await session.execute(
        select(Bouquet)
        .where(Bouquet.seller_id == seller_id)
        .options(selectinload(Bouquet.bouquet_items))
        .order_by(Bouquet.id.desc())
    )
    bouquets = result.scalars().all()
    stock = await _flower_stock_and_avg_price(session, seller_id)
    flower_names: Dict[int, str] = {}
    out = []
    for b in bouquets:
        items_payload = []
        total_cost = Decimal("0")
        total_price = Decimal("0")
        for bi in b.bouquet_items or []:
            if bi.flower_id not in flower_names:
                f = await session.get(Flower, bi.flower_id)
                flower_names[bi.flower_id] = f.name if f else str(bi.flower_id)
            name = flower_names[bi.flower_id]
            _, avg = stock.get(bi.flower_id, (0, Decimal("0")))
            cost = avg * bi.quantity
            total_cost += cost
            items_payload.append({
                "flower_id": bi.flower_id,
                "flower_name": name,
                "quantity": bi.quantity,
            })
        total_price = total_cost + b.packaging_cost
        can_assemble = _can_assemble_count(stock, b.bouquet_items or [])
        out.append({
            "id": b.id,
            "name": b.name,
            "packaging_cost": float(b.packaging_cost),
            "total_cost": float(total_cost),
            "total_price": float(total_price),
            "items": items_payload,
            "can_assemble_count": can_assemble,
            "is_active": can_assemble >= 1,
        })
    return out


async def get_bouquet_with_totals(
    session: AsyncSession, bouquet_id: int, seller_id: int
) -> Optional[Dict[str, Any]]:
    result = await session.execute(
        select(Bouquet)
        .where(Bouquet.id == bouquet_id, Bouquet.seller_id == seller_id)
        .options(selectinload(Bouquet.bouquet_items))
    )
    b = result.scalar_one_or_none()
    if not b:
        return None
    stock = await _flower_stock_and_avg_price(session, seller_id)
    items_payload = []
    total_cost = Decimal("0")
    total_price = Decimal("0")
    for bi in b.bouquet_items or []:
        f = await session.get(Flower, bi.flower_id)
        name = f.name if f else str(bi.flower_id)
        _, avg = stock.get(bi.flower_id, (0, Decimal("0")))
        cost = avg * bi.quantity
        total_cost += cost
        items_payload.append({
            "flower_id": bi.flower_id,
            "flower_name": name,
            "quantity": bi.quantity,
        })
    total_price = total_cost + b.packaging_cost
    can_assemble = _can_assemble_count(stock, b.bouquet_items or [])
    return {
        "id": b.id,
        "name": b.name,
        "packaging_cost": float(b.packaging_cost),
        "total_cost": float(total_cost),
        "total_price": float(total_price),
        "items": items_payload,
        "can_assemble_count": can_assemble,
        "is_active": can_assemble >= 1,
    }


def _check_stock(
    stock: Dict[int, Tuple[int, Decimal]],
    items: List[Dict[str, Any]],
) -> Optional[str]:
    needed: Dict[int, int] = {}
    for it in items:
        flower_id = it["flower_id"]
        qty = it["quantity"]
        needed[flower_id] = needed.get(flower_id, 0) + qty
    for flower_id, need in needed.items():
        have = stock.get(flower_id, (0, Decimal("0")))[0]
        if have < need:
            return f"Недостаточно цветка id={flower_id}: нужно {need}, в наличии {have}"
    return None


async def create_bouquet(
    session: AsyncSession,
    seller_id: int,
    name: str,
    packaging_cost: float,
    items: List[Dict[str, Any]],
) -> Bouquet:
    stock = await _flower_stock_and_avg_price(session, seller_id)
    err = _check_stock(stock, items)
    if err:
        raise ValueError(err)
    bouquet = Bouquet(
        seller_id=seller_id,
        name=name,
        packaging_cost=Decimal(str(packaging_cost)),
    )
    session.add(bouquet)
    await session.flush()
    for it in items:
        bi = BouquetItem(
            bouquet_id=bouquet.id,
            flower_id=it["flower_id"],
            quantity=it["quantity"],
        )
        session.add(bi)
    await session.commit()
    await session.refresh(bouquet)
    return bouquet


async def update_bouquet(
    session: AsyncSession,
    bouquet_id: int,
    seller_id: int,
    name: str,
    packaging_cost: float,
    items: List[Dict[str, Any]],
) -> Optional[Bouquet]:
    result = await session.execute(
        select(Bouquet).where(
            Bouquet.id == bouquet_id,
            Bouquet.seller_id == seller_id,
        )
    )
    b = result.scalar_one_or_none()
    if not b:
        return None
    stock = await _flower_stock_and_avg_price(session, seller_id)
    err = _check_stock(stock, items)
    if err:
        raise ValueError(err)
    b.name = name
    b.packaging_cost = Decimal(str(packaging_cost))
    await session.execute(delete(BouquetItem).where(BouquetItem.bouquet_id == bouquet_id))
    for it in items:
        bi = BouquetItem(
            bouquet_id=bouquet_id,
            flower_id=it["flower_id"],
            quantity=it["quantity"],
        )
        session.add(bi)
    await session.commit()
    await session.refresh(b)
    return b


async def delete_bouquet(
    session: AsyncSession, bouquet_id: int, seller_id: int
) -> bool:
    result = await session.execute(
        select(Bouquet).where(
            Bouquet.id == bouquet_id,
            Bouquet.seller_id == seller_id,
        )
    )
    b = result.scalar_one_or_none()
    if not b:
        return False
    await session.execute(delete(BouquetItem).where(BouquetItem.bouquet_id == bouquet_id))
    await session.delete(b)
    await session.commit()
    return True
