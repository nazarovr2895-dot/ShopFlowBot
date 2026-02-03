"""Seller web panel API - protected by X-Seller-Token."""
import os
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_session
from backend.app.api.seller_auth import require_seller_token
from backend.app.core.logging import get_logger
from backend.app.schemas import ProductCreate, ProductUpdate
from backend.app.services.orders import OrderService, OrderServiceError
from backend.app.services.sellers import SellerService, SellerServiceError
from backend.app.services.products import (
    create_product_service,
    get_products_by_seller_service,
    get_product_by_id_service,
    update_product_service,
    delete_product_service,
)
from backend.app.services.referrals import accrue_commissions

router = APIRouter(dependencies=[Depends(require_seller_token)])
logger = get_logger(__name__)


def _get_seller_id(seller_id: int = Depends(require_seller_token)) -> int:
    return seller_id


# --- SELLER INFO ---
@router.get("/me")
async def get_me(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Get current seller info including shop link."""
    service = SellerService(session)
    data = await service.get_seller(seller_id)
    if not data:
        return {}
    bot_username = os.getenv("BOT_USERNAME", "")
    if bot_username:
        data["shop_link"] = f"https://t.me/{bot_username}?start=seller_{seller_id}"
    else:
        data["shop_link"] = None
    return data


# --- ORDERS ---
@router.get("/orders")
async def get_orders(
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Get orders for current seller. status=pending|accepted|assembling|in_transit|done|completed|rejected.
    For history (done/completed): use date_from, date_to."""
    service = OrderService(session)
    orders = await service.get_seller_orders(seller_id, status)
    # Filter by date if provided (for order history)
    if date_from or date_to:
        result = []
        for o in orders:
            created = o.get("created_at") or ""
            try:
                if date_from and created[:10] < date_from[:10]:
                    continue
                if date_to and created[:10] > date_to[:10]:
                    continue
            except (IndexError, TypeError):
                pass
            result.append(o)
        return result
    return orders


@router.post("/orders/{order_id}/accept")
async def accept_order(
    order_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    service = OrderService(session)
    try:
        result = await service.accept_order(order_id, verify_seller_id=seller_id)
        await session.commit()
        return result
    except OrderServiceError as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        await session.rollback()
        logger.exception("accept_order failed for order_id=%s", order_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/orders/{order_id}/reject")
async def reject_order(
    order_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    service = OrderService(session)
    try:
        result = await service.reject_order(order_id, verify_seller_id=seller_id)
        await session.commit()
        return result
    except OrderServiceError as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/orders/{order_id}/status")
async def update_order_status(
    order_id: int,
    status: str,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    service = OrderService(session)
    try:
        result = await service.update_status(
            order_id, status, verify_seller_id=seller_id, accrue_commissions_func=accrue_commissions
        )
        await session.commit()
        return result
    except OrderServiceError as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        await session.rollback()
        logger.exception("update_order_status failed for order_id=%s status=%s", order_id, status)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/orders/{order_id}/price")
async def update_order_price(
    order_id: int,
    new_price: float,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from decimal import Decimal
    from fastapi import HTTPException
    service = OrderService(session)
    try:
        result = await service.update_order_price(order_id, Decimal(str(new_price)), seller_id)
        await session.commit()
        return result
    except OrderServiceError as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        await session.rollback()
        logger.exception("update_order_price failed for order_id=%s", order_id)
        raise HTTPException(status_code=500, detail=str(e))


# --- STATS ---
@router.get("/stats")
async def get_stats(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Get order stats for current seller."""
    service = OrderService(session)
    return await service.get_seller_stats(seller_id)


# --- PRODUCTS ---
@router.get("/products")
async def get_products(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    products = await get_products_by_seller_service(session, seller_id, only_available=False)
    return products or []


@router.post("/products")
async def add_product(
    data: ProductCreate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    if data.seller_id != seller_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    product_data = {
        "seller_id": data.seller_id,
        "name": data.name,
        "description": data.description,
        "price": data.price,
        "photo_id": data.photo_id,
        "quantity": data.quantity,
    }
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
        from fastapi import HTTPException
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
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Товар не найден")
    await delete_product_service(session, product_id)
    return {"status": "deleted"}


# --- SECURITY ---
class ChangeCredentialsBody(BaseModel):
    old_login: str
    old_password: str
    new_login: str
    new_password: str


@router.put("/security/change-credentials")
async def change_credentials(
    body: ChangeCredentialsBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Change web login and password. Requires current credentials for verification."""
    service = SellerService(session)
    try:
        return await service.change_web_credentials(
            seller_id,
            body.old_login,
            body.old_password,
            body.new_login,
            body.new_password,
        )
    except SellerServiceError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=e.status_code, detail=e.message)


# --- LIMITS ---
@router.put("/limits")
async def update_limits(
    max_orders: int = Query(...),
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    service = SellerService(session)
    try:
        return await service.update_limits(seller_id, max_orders)
    except SellerServiceError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=e.status_code, detail=e.message)
