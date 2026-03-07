"""Product CRUD + recalculate endpoints."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.schemas import ProductCreate, ProductUpdate
from backend.app.services.products import (
    create_product_service,
    get_products_by_seller_service,
    get_product_by_id_service,
    update_product_service,
    delete_product_service,
)
from backend.app.services.bouquets import get_bouquet_with_totals

from ._common import (
    require_seller_token,
    get_session,
)

router = APIRouter()


# --- PRODUCTS ---

@router.get("/products")
async def get_products(
    preorder: Optional[bool] = Query(None, description="Filter by is_preorder: true=preorder only, false=regular only"),
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from backend.app.services.bouquets import get_stock_shortages_by_bouquet

    products = await get_products_by_seller_service(
        session, seller_id, only_available=False, preorder=preorder
    )
    if not products:
        return []

    shortages = await get_stock_shortages_by_bouquet(session, seller_id)

    result = []
    for p in products:
        d = {
            "id": p.id,
            "seller_id": p.seller_id,
            "name": p.name,
            "price": p.price,
            "description": p.description,
            "photo_id": p.photo_id,
            "photo_ids": p.photo_ids,
            "is_active": p.is_active,
            "quantity": p.quantity,
            "bouquet_id": p.bouquet_id,
            "is_preorder": p.is_preorder,
            "cost_price": p.cost_price,
            "markup_percent": p.markup_percent,
            "composition": p.composition,
            "category_id": getattr(p, "category_id", None),
        }
        if p.bouquet_id and p.bouquet_id in shortages:
            d["stock_shortage"] = shortages[p.bouquet_id]
        else:
            d["stock_shortage"] = None
        result.append(d)
    return result


@router.post("/products")
async def add_product(
    data: ProductCreate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    if data.seller_id != seller_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    product_data = {
        "seller_id": data.seller_id,
        "name": data.name,
        "description": data.description,
        "price": data.price,
        "quantity": data.quantity,
        "is_preorder": getattr(data, "is_preorder", False),
    }
    if data.photo_ids is not None:
        product_data["photo_ids"] = data.photo_ids
    elif data.photo_id is not None:
        product_data["photo_id"] = data.photo_id
    if data.bouquet_id is not None:
        product_data["bouquet_id"] = data.bouquet_id
    if data.cost_price is not None:
        product_data["cost_price"] = data.cost_price
    if data.markup_percent is not None:
        product_data["markup_percent"] = data.markup_percent
    if data.composition is not None:
        product_data["composition"] = [item.model_dump() for item in data.composition]
    if data.category_id is not None:
        product_data["category_id"] = data.category_id
    return await create_product_service(session, product_data)


@router.put("/products/{product_id}")
async def update_product(
    product_id: int,
    data: ProductUpdate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    product = await get_product_by_id_service(session, product_id)
    if not product or product.seller_id != seller_id:
        raise HTTPException(status_code=404, detail="Товар не найден")
    update_data = data.model_dump(exclude_unset=True)
    return await update_product_service(session, product_id, update_data)


@router.delete("/products/{product_id}")
async def delete_product(
    product_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    product = await get_product_by_id_service(session, product_id)
    if not product or product.seller_id != seller_id:
        raise HTTPException(status_code=404, detail="Товар не найден")
    await delete_product_service(session, product_id)
    return {"status": "deleted"}


# --- PRODUCT RECALCULATE ---

@router.post("/products/{product_id}/recalculate")
async def api_recalculate_product_price(
    product_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    product = await get_product_by_id_service(session, product_id)
    if not product or product.seller_id != seller_id:
        raise HTTPException(status_code=404, detail="Товар не найден")
    if not product.bouquet_id:
        raise HTTPException(status_code=400, detail="Товар не привязан к букету")

    bouquet_data = await get_bouquet_with_totals(session, product.bouquet_id, seller_id)
    if not bouquet_data:
        raise HTTPException(status_code=404, detail="Букет не найден")

    new_cost = bouquet_data["total_price"]  # себестоимость (цветы + упаковка)
    update: dict = {"cost_price": new_cost}

    if product.markup_percent is not None:
        update["price"] = round(new_cost * (1 + float(product.markup_percent) / 100), 2)

    update["quantity"] = bouquet_data.get("can_assemble_count", 0)

    updated = await update_product_service(session, product_id, update)
    return {
        "id": updated.id,
        "name": updated.name,
        "price": float(updated.price),
        "cost_price": float(updated.cost_price) if updated.cost_price else None,
        "markup_percent": float(updated.markup_percent) if updated.markup_percent else None,
        "quantity": updated.quantity,
    }
