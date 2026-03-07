"""Inventory management: flowers, receptions, bouquets, inventory checks, write-offs."""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.seller_web._common import (
    logger,
    get_session,
    require_seller_token,
)
from backend.app.schemas import (
    FlowerCreate,
    ReceptionCreate,
    ReceptionUpdate,
    ReceptionItemCreate,
    ReceptionItemUpdate,
    InventoryCheckLine,
    BouquetCreate,
)
from backend.app.services.receptions import (
    list_flowers,
    create_flower,
    delete_flower,
    list_receptions,
    create_reception,
    update_reception,
    get_reception,
    add_reception_item,
    update_reception_item,
    delete_reception_item,
    get_reception_items_for_inventory,
    inventory_check,
    inventory_apply,
    ReceptionClosedError,
    write_off_item,
    get_write_offs,
    get_write_off_stats,
    WriteOffError,
    get_all_items_for_inventory,
    global_inventory_check,
    global_inventory_apply,
)
from backend.app.services.bouquets import (
    list_bouquets_with_totals,
    get_bouquet_with_totals,
    create_bouquet as create_bouquet_svc,
    update_bouquet as update_bouquet_svc,
    delete_bouquet as delete_bouquet_svc,
)
router = APIRouter()


def _handle_crm_db_error(e: Exception) -> None:
    """Raise 503 with clear message if CRM tables are missing (migration not run)."""
    logger.exception("CRM API error: %s", e)
    if isinstance(e, (OperationalError, ProgrammingError)):
        msg = str(e).lower()
        if "does not exist" in msg or "undefined_table" in msg or "relation" in msg or "column" in msg:
            raise HTTPException(
                status_code=503,
                detail="CRM tables not found. Run migrations in backend: cd backend && alembic upgrade head",
            ) from e
    raise e


# --- FLOWERS (catalog) ---
@router.get("/flowers")
async def api_list_flowers(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    try:
        flowers = await list_flowers(session, seller_id)
        return [{"id": f.id, "name": f.name, "default_shelf_life_days": f.default_shelf_life_days} for f in flowers]
    except Exception as e:
        _handle_crm_db_error(e)
        raise


@router.post("/flowers")
async def api_create_flower(
    data: FlowerCreate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    try:
        flower = await create_flower(
            session, seller_id, data.name, data.default_shelf_life_days
        )
        return {"id": flower.id, "name": flower.name, "default_shelf_life_days": flower.default_shelf_life_days}
    except Exception as e:
        _handle_crm_db_error(e)
        raise


@router.delete("/flowers/{flower_id}")
async def api_delete_flower(
    flower_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    ok = await delete_flower(session, flower_id, seller_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Цветок не найден")
    return {"status": "deleted"}


# --- RECEPTIONS ---
@router.get("/receptions")
async def api_list_receptions(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    try:
        return await list_receptions(session, seller_id)
    except Exception as e:
        _handle_crm_db_error(e)
        raise


@router.post("/receptions")
async def api_create_reception(
    data: ReceptionCreate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    rec_date = None
    if data.reception_date:
        try:
            rec_date = datetime.strptime(data.reception_date, "%Y-%m-%d").date()
        except ValueError:
            pass
    rec = await create_reception(
        session, seller_id, data.name, rec_date,
        supplier=data.supplier, invoice_number=data.invoice_number,
    )
    return {
        "id": rec.id,
        "name": rec.name,
        "reception_date": rec.reception_date.isoformat() if rec.reception_date else None,
        "is_closed": getattr(rec, "is_closed", False),
        "supplier": getattr(rec, "supplier", None),
        "invoice_number": getattr(rec, "invoice_number", None),
    }


@router.put("/receptions/{reception_id}")
async def api_update_reception(
    reception_id: int,
    data: ReceptionUpdate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    kwargs = data.model_dump(exclude_unset=True)
    rec = await update_reception(session, reception_id, seller_id, **kwargs)
    if not rec:
        raise HTTPException(status_code=404, detail="Приёмка не найдена")
    return {
        "id": rec.id,
        "name": rec.name,
        "reception_date": rec.reception_date.isoformat() if rec.reception_date else None,
        "is_closed": getattr(rec, "is_closed", False),
        "supplier": getattr(rec, "supplier", None),
        "invoice_number": getattr(rec, "invoice_number", None),
    }


@router.get("/receptions/{reception_id}")
async def api_get_reception(
    reception_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    rec = await get_reception(session, reception_id, seller_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Приёмка не найдена")
    return rec


@router.post("/receptions/{reception_id}/items")
async def api_add_reception_item(
    reception_id: int,
    data: ReceptionItemCreate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    arr_date = None
    if data.arrival_date:
        try:
            arr_date = datetime.strptime(data.arrival_date, "%Y-%m-%d").date()
        except ValueError:
            pass
    try:
        item = await add_reception_item(
            session,
            reception_id,
            seller_id,
            data.flower_id,
            data.quantity_initial,
            arr_date,
            data.shelf_life_days,
            data.price_per_unit,
        )
    except ReceptionClosedError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not item:
        raise HTTPException(status_code=400, detail="Приёмка или цветок не найдены")
    resp = {
        "id": item.id,
        "flower_id": item.flower_id,
        "quantity_initial": item.quantity_initial,
        "arrival_date": item.arrival_date.isoformat() if item.arrival_date else None,
        "shelf_life_days": item.shelf_life_days,
        "price_per_unit": float(item.price_per_unit),
        "remaining_quantity": item.remaining_quantity,
        "sold_quantity": item.sold_quantity,
        "sold_amount": float(item.sold_amount),
    }
    # Sync bouquet product quantities after new reception item
    try:
        from backend.app.services.bouquets import sync_bouquet_product_quantities
        await sync_bouquet_product_quantities(session, seller_id)
        await session.commit()
    except Exception:
        logger.exception("sync_bouquet_product_quantities failed after add_reception_item")
    return resp


@router.put("/receptions/items/{item_id}")
async def api_update_reception_item(
    item_id: int,
    data: ReceptionItemUpdate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    kwargs = data.model_dump(exclude_unset=True)
    if "arrival_date" in kwargs and kwargs["arrival_date"]:
        try:
            kwargs["arrival_date"] = datetime.strptime(kwargs["arrival_date"], "%Y-%m-%d").date()
        except ValueError:
            kwargs.pop("arrival_date", None)
    item = await update_reception_item(session, item_id, seller_id, **kwargs)
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    return {
        "id": item.id,
        "remaining_quantity": item.remaining_quantity,
        "quantity_initial": item.quantity_initial,
        "arrival_date": item.arrival_date.isoformat() if item.arrival_date else None,
        "shelf_life_days": item.shelf_life_days,
        "price_per_unit": float(item.price_per_unit),
        "sold_quantity": item.sold_quantity,
        "sold_amount": float(item.sold_amount),
    }


@router.delete("/receptions/items/{item_id}")
async def api_delete_reception_item(
    item_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    ok = await delete_reception_item(session, item_id, seller_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    return {"status": "deleted"}


# --- BOUQUETS ---
@router.get("/bouquets")
async def api_list_bouquets(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    return await list_bouquets_with_totals(session, seller_id)


@router.get("/bouquets/{bouquet_id}")
async def api_get_bouquet(
    bouquet_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    b = await get_bouquet_with_totals(session, bouquet_id, seller_id)
    if not b:
        raise HTTPException(status_code=404, detail="Букет не найден")
    return b


@router.post("/bouquets")
async def api_create_bouquet(
    data: BouquetCreate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    items = [{"flower_id": i.flower_id, "quantity": i.quantity} for i in data.items]
    try:
        b = await create_bouquet_svc(
            session, seller_id, data.name, data.packaging_cost, items
        )
        return await get_bouquet_with_totals(session, b.id, seller_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/bouquets/{bouquet_id}")
async def api_update_bouquet(
    bouquet_id: int,
    data: BouquetCreate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    items = [{"flower_id": i.flower_id, "quantity": i.quantity} for i in data.items]
    try:
        b = await update_bouquet_svc(
            session, bouquet_id, seller_id, data.name, data.packaging_cost, items
        )
        if not b:
            raise HTTPException(status_code=404, detail="Букет не найден")
        return await get_bouquet_with_totals(session, bouquet_id, seller_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/bouquets/{bouquet_id}")
async def api_delete_bouquet(
    bouquet_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    ok = await delete_bouquet_svc(session, bouquet_id, seller_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Букет не найден")
    return {"status": "deleted"}


# --- INVENTORY ---
@router.get("/receptions/{reception_id}/inventory")
async def api_get_reception_inventory(
    reception_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    rec_result = await get_reception(session, reception_id, seller_id)
    if not rec_result:
        raise HTTPException(status_code=404, detail="Приёмка не найдена")
    items = await get_reception_items_for_inventory(session, reception_id, seller_id)
    return {"reception_id": reception_id, "items": items}


@router.post("/receptions/{reception_id}/inventory/check")
async def api_inventory_check(
    reception_id: int,
    body: list[InventoryCheckLine],
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    rec_result = await get_reception(session, reception_id, seller_id)
    if not rec_result:
        raise HTTPException(status_code=404, detail="Приёмка не найдена")
    lines = [{"reception_item_id": x.reception_item_id, "actual_quantity": x.actual_quantity} for x in body]
    return await inventory_check(session, reception_id, seller_id, lines)


@router.post("/receptions/{reception_id}/inventory/apply")
async def api_inventory_apply(
    reception_id: int,
    body: list[InventoryCheckLine],
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    rec_result = await get_reception(session, reception_id, seller_id)
    if not rec_result:
        raise HTTPException(status_code=404, detail="Приёмка не найдена")
    lines = [{"reception_item_id": x.reception_item_id, "actual_quantity": x.actual_quantity} for x in body]
    result = await inventory_apply(session, reception_id, seller_id, lines)
    await session.commit()
    # Sync bouquet product quantities after inventory adjustment
    try:
        from backend.app.services.bouquets import sync_bouquet_product_quantities
        await sync_bouquet_product_quantities(session, seller_id)
        await session.commit()
    except Exception:
        logger.exception("sync_bouquet_product_quantities failed after inventory_apply")
    return result


# --- WRITE-OFF (quick flower disposal) ---
class WriteOffBody(BaseModel):
    quantity: int
    reason: str  # wilted, broken, defect, other
    comment: Optional[str] = None


@router.post("/receptions/items/{item_id}/write-off")
async def api_write_off_item(
    item_id: int,
    body: WriteOffBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    try:
        result = await write_off_item(
            session, item_id, seller_id,
            quantity=body.quantity,
            reason=body.reason,
            comment=body.comment,
        )
        # Sync bouquet product quantities after write-off
        try:
            from backend.app.services.bouquets import sync_bouquet_product_quantities
            await sync_bouquet_product_quantities(session, seller_id)
            await session.commit()
        except Exception:
            logger.exception("sync_bouquet_product_quantities failed after write_off")
        return result
    except WriteOffError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/write-offs")
async def api_get_write_offs(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    from datetime import date as date_type
    df = date_type.fromisoformat(date_from) if date_from else None
    dt = date_type.fromisoformat(date_to) if date_to else None
    return await get_write_offs(session, seller_id, df, dt)


@router.get("/write-offs/stats")
async def api_get_write_off_stats(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    """Aggregated waste report: totals, by reason, by flower, daily series."""
    from datetime import date as date_type
    df = date_type.fromisoformat(date_from) if date_from else None
    dt = date_type.fromisoformat(date_to) if date_to else None
    return await get_write_off_stats(session, seller_id, df, dt)


# --- GLOBAL INVENTORY ---
@router.get("/inventory/all")
async def get_global_inventory(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """All flowers with remaining stock from open receptions, grouped by flower."""
    return await get_all_items_for_inventory(session, seller_id)


@router.post("/inventory/all/check")
async def check_global_inventory(
    lines: List[dict],
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Preview differences between system and actual quantities per flower."""
    return await global_inventory_check(session, seller_id, lines)


@router.post("/inventory/all/apply")
async def apply_global_inventory(
    lines: List[dict],
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Apply actual quantities per flower across all open receptions."""
    result = await global_inventory_apply(session, seller_id, lines)
    await session.commit()
    # Sync bouquet product quantities after global inventory adjustment
    try:
        from backend.app.services.bouquets import sync_bouquet_product_quantities
        await sync_bouquet_product_quantities(session, seller_id)
        await session.commit()
    except Exception:
        logger.exception("sync_bouquet_product_quantities failed after global_inventory_apply")
    return result
