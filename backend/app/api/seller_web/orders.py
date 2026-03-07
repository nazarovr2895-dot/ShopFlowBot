"""Seller web panel — Orders, Preorder Campaigns, Preorder Procurement."""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.seller_web._common import (
    logger,
    require_seller_token,
    require_seller_token_with_owner,
    get_session,
    resolve_branch_target,
)
from backend.app.services.orders import OrderService, OrderServiceError

router = APIRouter()


# --- ORDERS ---
@router.get("/orders")
async def get_orders(
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    preorder: Optional[bool] = Query(None, description="Filter by is_preorder: true=preorders only, false=regular only"),
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Get orders for current seller. status=pending|accepted|assembling|in_transit|ready_for_pickup|done|completed|rejected.
    For history (done/completed): use date_from, date_to. preorder=true for preorders only."""
    service = OrderService(session)
    orders = await service.get_seller_orders(seller_id, status, preorder=preorder)
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


@router.get("/orders/{order_id}")
async def get_order(
    order_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    service = OrderService(session)
    order = await service.get_seller_order_by_id(seller_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    return order


@router.post("/orders/{order_id}/accept")
async def accept_order(
    order_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    service = OrderService(session)
    try:
        result = await service.accept_order(order_id, verify_seller_id=seller_id)
        await session.commit()
        # Sync bouquet product quantities after stock deduction
        try:
            from backend.app.services.bouquets import sync_bouquet_product_quantities
            await sync_bouquet_product_quantities(session, seller_id)
            await session.commit()
        except Exception:
            logger.exception("sync_bouquet_product_quantities failed after accept_order")

        # --- Try to create YuKassa payment if configured (skip for on_pickup) ---
        confirmation_url = None
        buyer_id = result["buyer_id"]
        seller_id_val = result["seller_id"]
        total_price = result.get("total_price")
        payment_method = result.get("payment_method", "online")

        if payment_method != "on_pickup":
            try:
                from backend.app.services.payment import PaymentService, PaymentNotConfiguredError
                pay_svc = PaymentService(session)
                pay_result = await pay_svc.create_payment(order_id=order_id)
                await session.commit()
                confirmation_url = pay_result.get("confirmation_url")
                logger.info(
                    "Payment created on accept (seller_web)",
                    order_id=order_id,
                    payment_id=pay_result.get("payment_id"),
                )
            except PaymentNotConfiguredError:
                pass  # YuKassa not configured — skip silently
            except Exception as pay_err:
                logger.warning(
                    "Payment creation on accept failed (non-critical)",
                    order_id=order_id,
                    error=str(pay_err),
                )

        # --- Send buyer notification ---
        if confirmation_url and buyer_id:
            from backend.app.services.telegram_notify import notify_buyer_payment_required
            await notify_buyer_payment_required(
                buyer_id=buyer_id,
                order_id=order_id,
                seller_id=seller_id_val,
                total_price=float(total_price) if total_price else 0,
                confirmation_url=confirmation_url,
                items_info=result.get("items_info", ""),
            )
        else:
            from backend.app.services.telegram_notify import notify_buyer_order_status
            await notify_buyer_order_status(
                buyer_id=buyer_id,
                order_id=order_id,
                new_status=result["new_status"],
                seller_id=seller_id_val,
                items_info=result.get("items_info"),
                total_price=total_price,
                payment_method=payment_method,
            )

        result["confirmation_url"] = confirmation_url
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
    service = OrderService(session)
    try:
        result = await service.reject_order(order_id, verify_seller_id=seller_id)
        await session.commit()

        # Auto-refund if order was paid
        from backend.app.models.order import Order
        order_obj = await session.get(Order, order_id)
        if order_obj and order_obj.payment_status == "succeeded":
            try:
                from backend.app.services.payment import PaymentService
                pay_svc = PaymentService(session)
                await pay_svc.refund_payment(order_id)
                await session.commit()
                from backend.app.services.telegram_notify import (
                    notify_buyer_payment_refunded, notify_seller_payment_refunded, resolve_notification_chat_id,
                )
                refund_amt = result.get("total_price", 0)
                if order_obj.buyer_id:
                    await notify_buyer_payment_refunded(
                        order_obj.buyer_id, order_id, order_obj.seller_id, refund_amt,
                    )
                _chat_id = await resolve_notification_chat_id(session, order_obj.seller_id)
                await notify_seller_payment_refunded(
                    _chat_id, order_id, refund_amt,
                )
            except Exception as refund_err:
                logger.warning(
                    "Auto-refund failed for rejected order",
                    order_id=order_id,
                    error=str(refund_err),
                )

        from backend.app.services.telegram_notify import notify_buyer_order_status
        await notify_buyer_order_status(
            buyer_id=result["buyer_id"],
            order_id=order_id,
            new_status=result["new_status"],
            seller_id=result["seller_id"],
            items_info=result.get("items_info"),
            total_price=result.get("total_price"),
        )
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
    from backend.app.services.telegram_notify import notify_buyer_order_status
    service = OrderService(session)
    try:
        result = await service.update_status(
            order_id, status, verify_seller_id=seller_id,
        )
        await session.commit()
        # Notify buyer in Telegram about status change
        await notify_buyer_order_status(
            buyer_id=result["buyer_id"],
            order_id=order_id,
            new_status=result["new_status"],
            seller_id=result["seller_id"],
            items_info=result.get("items_info"),
            total_price=result.get("total_price"),
        )
        if result["new_status"] == "completed":
            from backend.app.services.telegram_notify import notify_seller_order_completed, resolve_notification_chat_id
            _chat_id = await resolve_notification_chat_id(session, result["seller_id"])
            await notify_seller_order_completed(
                seller_id=_chat_id,
                order_id=order_id,
            )
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
    service = OrderService(session)
    try:
        result = await service.update_order_price(order_id, Decimal(str(new_price)), seller_id)
        await session.commit()
        from backend.app.services.telegram_notify import notify_buyer_order_price_changed
        await notify_buyer_order_price_changed(
            buyer_id=result["buyer_id"],
            order_id=result["order_id"],
            seller_id=result["seller_id"],
            new_price=result["total_price"],
            items_info=result.get("items_info", ""),
        )
        return result
    except OrderServiceError as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        await session.rollback()
        logger.exception("update_order_price failed for order_id=%s", order_id)
        raise HTTPException(status_code=500, detail=str(e))


# --- PREORDER CAMPAIGNS ---
class PreorderCampaignNotifyBody(BaseModel):
    message: Optional[str] = None  # Custom message to include in notification


@router.post("/preorder-notify-subscribers")
async def notify_subscribers_preorder(
    body: PreorderCampaignNotifyBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Send a push notification to all subscribers that preorders are open."""
    from backend.app.models.cart import BuyerFavoriteSeller
    from backend.app.models.seller import Seller
    from backend.app.services.telegram_notify import notify_subscriber_preorder_opened

    seller = await session.get(Seller, seller_id)
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    shop_name = seller.shop_name or "Магазин"

    result = await session.execute(
        select(BuyerFavoriteSeller.buyer_id).where(BuyerFavoriteSeller.seller_id == seller_id)
    )
    subscriber_ids = [row[0] for row in result.all()]
    if not subscriber_ids:
        return {"sent": 0, "total_subscribers": 0}

    sent = 0
    for buyer_id in subscriber_ids:
        ok = await notify_subscriber_preorder_opened(
            buyer_id=buyer_id,
            shop_name=shop_name,
            seller_id=seller_id,
            message=body.message or "",
        )
        if ok:
            sent += 1

    return {"sent": sent, "total_subscribers": len(subscriber_ids)}


# --- PREORDER PROCUREMENT ---
@router.get("/preorder-summary")
async def get_preorder_summary(
    date: str = Query(..., description="Delivery date YYYY-MM-DD"),
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Aggregated preorder summary for a specific delivery date (procurement planning)."""
    try:
        target_date = datetime.strptime(date[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid date format (expected YYYY-MM-DD)")
    service = OrderService(session)
    return await service.get_preorder_summary(seller_id, target_date)


@router.get("/preorder-analytics")
async def get_preorder_analytics(
    period: Optional[str] = Query(None, description="Predefined range: 7d, 30d, 90d"),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    branch: Optional[str] = Query(None, description="'all' for aggregated or seller_id"),
    auth: tuple = Depends(require_seller_token_with_owner),
    session: AsyncSession = Depends(get_session),
):
    """Preorder-specific analytics (completion rate, avg lead time, revenue)."""
    seller_id, owner_id = auth
    target = await resolve_branch_target(branch, seller_id, owner_id, session)
    dt_from, dt_to = None, None
    if period:
        days_map = {"7d": 7, "30d": 30, "90d": 90}
        days = days_map.get(period)
        if days:
            dt_from = datetime.utcnow() - timedelta(days=days)
    if date_from:
        try:
            dt_from = datetime.strptime(date_from[:10], "%Y-%m-%d")
        except (ValueError, TypeError):
            pass
    if date_to:
        try:
            dt_to = datetime.strptime(date_to[:10], "%Y-%m-%d").replace(hour=23, minute=59, second=59)
        except (ValueError, TypeError):
            pass
    service = OrderService(session)
    return await service.get_preorder_analytics(target, dt_from, dt_to)
