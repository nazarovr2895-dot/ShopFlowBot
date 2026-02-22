from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from decimal import Decimal
from collections import defaultdict

from backend.app.api.deps import get_session
from backend.app.schemas import OrderCreate, OrderResponse, GuestCheckoutBody
from backend.app.core.auth import (
    TelegramInitData,
    get_current_user_optional,
    verify_user_id,
)
from backend.app.core.logging import get_logger
from backend.app.core.settings import get_settings
from backend.app.models.seller import Seller
from backend.app.models.product import Product
from backend.app.models.loyalty import normalize_phone
from sqlalchemy import select
from backend.app.services.orders import (
    OrderService,
    OrderServiceError,
    SellerNotFoundError,
    SellerBlockedError,
    SellerLimitReachedError,
    OrderNotFoundError,
    InvalidOrderStatusError,
)
router = APIRouter()
logger = get_logger(__name__)


async def require_internal_api_key(
    x_internal_key: Optional[str] = Header(None, alias="X-Internal-Key"),
):
    """Require internal API key for bot-to-backend order management calls."""
    settings = get_settings()
    if not settings.INTERNAL_API_KEY:
        # Not configured — allow all (dev mode); log warning
        logger.warning("INTERNAL_API_KEY not set — order management endpoints are unprotected")
        return
    if not x_internal_key or x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing internal API key")


def _handle_service_error(e: OrderServiceError):
    """Convert service exceptions to HTTP exceptions."""
    raise HTTPException(status_code=e.status_code, detail=e.message)


# --- 1. СОЗДАНИЕ ЗАКАЗА ---
@router.post("/create", response_model=OrderResponse)
async def create_order(
    data: OrderCreate,
    session: AsyncSession = Depends(get_session),
    current_user: Optional[TelegramInitData] = Depends(get_current_user_optional),
):
    """
    Создание заказа с проверкой лимитов и блокировкой продавца.
    
    Если запрос приходит от аутентифицированного пользователя (Mini App),
    проверяем что buyer_id совпадает с ID пользователя Telegram.
    """
    logger.info(
        "Creating order",
        buyer_id=data.buyer_id,
        seller_id=data.seller_id,
        total_price=float(data.total_price),
        delivery_type=data.delivery_type,
    )
    
    # Validate that authenticated user can only create orders for themselves
    if current_user:
        verify_user_id(current_user, data.buyer_id)
    
    service = OrderService(session)
    
    try:
        order = await service.create_order(
            buyer_id=data.buyer_id,
            seller_id=data.seller_id,
            items_info=data.items_info,
            total_price=data.total_price,
            delivery_type=data.delivery_type,
            address=data.address,
        )
        await session.commit()
        logger.info("Order created successfully", order_id=order.id, buyer_id=data.buyer_id)
        from backend.app.services.telegram_notify import notify_seller_new_order
        await notify_seller_new_order(
            seller_id=data.seller_id,
            order_id=order.id,
            items_info=data.items_info,
            total_price=float(order.total_price) if order.total_price is not None else None,
        )
        return order
    except OrderServiceError as e:
        await session.rollback()
        logger.warning(
            "Order creation failed",
            buyer_id=data.buyer_id,
            seller_id=data.seller_id,
            error=e.message,
            error_code=e.status_code,
        )
        _handle_service_error(e)


# --- 2. ПРИНЯТЬ ЗАКАЗ ---
@router.post("/{order_id}/accept")
async def accept_order(
    order_id: int,
    session: AsyncSession = Depends(get_session),
    _auth: None = Depends(require_internal_api_key),
):
    service = OrderService(session)
    try:
        result = await service.accept_order(order_id)
        await session.commit()

        # --- Try to create YuKassa payment if configured ---
        confirmation_url = None
        seller_id = result["seller_id"]
        buyer_id = result["buyer_id"]
        total_price = result.get("total_price")
        try:
            from backend.app.services.payment import PaymentService, PaymentServiceError, PaymentNotConfiguredError
            pay_svc = PaymentService(session)
            pay_result = await pay_svc.create_payment(order_id=order_id)
            await session.commit()
            confirmation_url = pay_result.get("confirmation_url")
            logger.info(
                "Payment created on accept",
                order_id=order_id,
                payment_id=pay_result.get("payment_id"),
            )
        except PaymentNotConfiguredError:
            # YuKassa not configured — skip silently
            pass
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
                seller_id=seller_id,
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
                seller_id=seller_id,
                items_info=result.get("items_info"),
                total_price=total_price,
            )

        return {
            "status": "ok",
            "new_status": result["new_status"],
            "buyer_id": buyer_id,
            "items_info": result["items_info"],
            "total_price": total_price,
            "original_price": result.get("original_price"),
            "confirmation_url": confirmation_url,
        }
    except OrderServiceError as e:
        await session.rollback()
        _handle_service_error(e)


# --- 3. ОТКЛОНИТЬ ЗАКАЗ ---
@router.post("/{order_id}/reject")
async def reject_order(
    order_id: int,
    session: AsyncSession = Depends(get_session),
    _auth: None = Depends(require_internal_api_key),
):
    service = OrderService(session)
    try:
        result = await service.reject_order(order_id)
        await session.commit()
        from backend.app.services.telegram_notify import notify_buyer_order_status
        await notify_buyer_order_status(
            buyer_id=result["buyer_id"],
            order_id=order_id,
            new_status=result["new_status"],
            seller_id=result["seller_id"],
            items_info=result.get("items_info"),
            total_price=result.get("total_price"),
        )
        return {
            "status": "ok",
            "new_status": result["new_status"],
            "buyer_id": result["buyer_id"],
            "items_info": result["items_info"],
            "total_price": result["total_price"]
        }
    except OrderServiceError as e:
        await session.rollback()
        _handle_service_error(e)


# --- 4. ЗАВЕРШИТЬ ЗАКАЗ ---
@router.post("/{order_id}/done")
async def done_order(
    order_id: int,
    session: AsyncSession = Depends(get_session),
    _auth: None = Depends(require_internal_api_key),
):
    service = OrderService(session)
    try:
        result = await service.complete_order(order_id)
        await session.commit()
        from backend.app.services.telegram_notify import notify_buyer_order_status
        await notify_buyer_order_status(
            buyer_id=result["buyer_id"],
            order_id=order_id,
            new_status=result["new_status"],
            seller_id=result["seller_id"],
            items_info=result.get("items_info"),
            total_price=result.get("total_price"),
        )
        return {
            "status": "ok",
            "new_status": result["new_status"],
            "buyer_id": result["buyer_id"],
            "items_info": result["items_info"],
            "total_price": result["total_price"]
        }
    except OrderServiceError as e:
        await session.rollback()
        _handle_service_error(e)


# --- 5. ЗАКАЗЫ ПРОДАВЦА ---
@router.get("/seller/{seller_id}")
async def get_seller_orders(
    seller_id: int, 
    status: str = None, 
    session: AsyncSession = Depends(get_session)
):
    """
    Получить заказы продавца с опциональной фильтрацией по статусу.
    Статусы: pending, accepted, rejected, done
    """
    service = OrderService(session)
    return await service.get_seller_orders(seller_id, status)


# --- 6. ЗАКАЗЫ ПОКУПАТЕЛЯ ---
@router.get("/buyer/{buyer_id}")
async def get_buyer_orders(
    buyer_id: int,
    session: AsyncSession = Depends(get_session)
):
    """Получить заказы покупателя"""
    service = OrderService(session)
    return await service.get_buyer_orders(buyer_id)


# --- 7. ИЗМЕНЕНИЕ СТАТУСА ЗАКАЗА ---
@router.put("/{order_id}/status")
async def update_order_status(
    order_id: int,
    status: str,
    session: AsyncSession = Depends(get_session),
    _auth: None = Depends(require_internal_api_key),
):
    """
    Изменить статус заказа.
    Допустимые статусы: pending, accepted, assembling, in_transit, done, completed, rejected
    - done: продавец отметил как выполненный
    - completed: покупатель подтвердил получение
    """
    logger.info("Updating order status", order_id=order_id, new_status=status)
    service = OrderService(session)
    try:
        result = await service.update_status(
            order_id=order_id,
            new_status=status,
        )
        await session.commit()
        logger.info(
            "Order status updated",
            order_id=order_id,
            new_status=result["new_status"],
        )
        from backend.app.services.telegram_notify import (
            notify_buyer_order_status,
            notify_seller_order_completed,
        )
        await notify_buyer_order_status(
            buyer_id=result["buyer_id"],
            order_id=order_id,
            new_status=result["new_status"],
            seller_id=result["seller_id"],
            items_info=result.get("items_info"),
            total_price=result.get("total_price"),
        )
        if result["new_status"] == "completed":
            await notify_seller_order_completed(
                seller_id=result["seller_id"],
                order_id=order_id,
            )
        return {
            "status": "ok",
            "new_status": result["new_status"],
            "buyer_id": result["buyer_id"],
            "seller_id": result["seller_id"],
            "items_info": result["items_info"],
            "total_price": result["total_price"],
        }
    except OrderServiceError as e:
        await session.rollback()
        logger.warning(
            "Order status update failed",
            order_id=order_id,
            requested_status=status,
            error=e.message,
        )
        _handle_service_error(e)


# --- 8. ИЗМЕНЕНИЕ ЦЕНЫ ЗАКАЗА ---
@router.put("/{order_id}/price")
async def update_order_price(
    order_id: int,
    new_price: float,
    session: AsyncSession = Depends(get_session),
    _auth: None = Depends(require_internal_api_key),
):
    """
    Изменить цену заказа. Можно изменить только для заказов со статусом 'accepted'.
    """
    if new_price <= 0:
        raise HTTPException(status_code=422, detail="Цена должна быть больше 0")
    logger.info("Updating order price", order_id=order_id, new_price=new_price)
    service = OrderService(session)
    try:
        result = await service.update_order_price(order_id, Decimal(str(new_price)))
        await session.commit()
        logger.info(
            "Order price updated",
            order_id=order_id,
            old_price=result.get("original_price"),
            new_price=result["total_price"]
        )
        from backend.app.services.telegram_notify import notify_buyer_order_price_changed
        await notify_buyer_order_price_changed(
            buyer_id=result["buyer_id"],
            order_id=result["order_id"],
            seller_id=result["seller_id"],
            new_price=result["total_price"],
            items_info=result.get("items_info", ""),
        )
        return {
            "status": "ok",
            "order_id": result["order_id"],
            "buyer_id": result["buyer_id"],
            "total_price": result["total_price"],
            "original_price": result["original_price"]
        }
    except OrderServiceError as e:
        await session.rollback()
        logger.warning(
            "Order price update failed",
            order_id=order_id,
            requested_price=new_price,
            error=e.message,
        )
        _handle_service_error(e)


# --- 9. СТАТИСТИКА ПРОДАВЦА ---
@router.get("/seller/{seller_id}/stats")
async def get_seller_order_stats(
    seller_id: int,
    session: AsyncSession = Depends(get_session)
):
    """
    Статистика заказов продавца: выручка, количество, комиссия 18%.
    """
    service = OrderService(session)
    return await service.get_seller_stats(seller_id)


# --- 10. ГОСТЕВОЙ CHECKOUT (без авторизации) ---
@router.post("/guest-checkout")
async def guest_checkout(
    data: GuestCheckoutBody,
    session: AsyncSession = Depends(get_session),
):
    """
    Create orders for a guest buyer (no Telegram auth required).
    Cart items are sent directly from the frontend localStorage.
    """
    # Validate phone
    normalized_phone = normalize_phone(data.guest_phone)
    if not normalized_phone or len(normalized_phone) != 11:
        raise HTTPException(status_code=400, detail="Неверный формат телефона")

    guest_name = data.guest_name.strip() or "Покупатель"

    # Group items by seller
    by_seller: dict = defaultdict(list)
    for item in data.items:
        by_seller[item.seller_id].append(item)

    order_service = OrderService(session)
    created = []

    # Build per-seller delivery type map
    delivery_map: dict = {}
    if data.delivery_by_seller:
        for dbs in data.delivery_by_seller:
            delivery_map[dbs.seller_id] = dbs.delivery_type

    # Pre-fetch all products from DB to validate prices (never trust client prices)
    all_product_ids = [it.product_id for it in data.items]
    products_result = await session.execute(
        select(Product).where(Product.id.in_(all_product_ids))
    )
    products_map = {p.id: p for p in products_result.scalars().all()}

    try:
        for seller_id, items in by_seller.items():
            # Resolve delivery type for this seller
            seller_delivery = delivery_map.get(seller_id, data.delivery_type)

            # Use DB prices, not client-sent prices
            total = Decimal("0")
            verified_items = []
            for it in items:
                product = products_map.get(it.product_id)
                if not product:
                    raise HTTPException(status_code=400, detail=f"Товар {it.product_id} не найден")
                if not product.is_active:
                    raise HTTPException(status_code=400, detail=f"Товар «{product.name}» недоступен")
                if product.seller_id != seller_id:
                    raise HTTPException(status_code=400, detail=f"Товар {it.product_id} не принадлежит магазину")
                db_price = Decimal(str(product.price))
                total += db_price * it.quantity
                verified_items.append((it, product, db_price))

            # Add delivery price from seller settings
            seller = await session.get(Seller, seller_id)
            delivery_price = Decimal("0")
            if seller and seller_delivery == "Доставка" and getattr(seller, "delivery_price", None):
                delivery_price = Decimal(str(seller.delivery_price))
                total += delivery_price

            items_info = ", ".join(
                f"{it.product_id}:{product.name}@{db_price} x {it.quantity}" for it, product, db_price in verified_items
            )

            # Build address (same format as authenticated checkout)
            if seller_delivery == "Самовывоз" and seller and getattr(seller, "map_url", None):
                addr = f"{seller.map_url}\n📞 {normalized_phone}\n👤 {guest_name}"
            else:
                addr = f"{data.address}\n📞 {normalized_phone}\n👤 {guest_name}"

            order = await order_service.create_guest_order(
                seller_id=seller_id,
                items_info=items_info,
                total_price=total,
                delivery_type=seller_delivery,
                address=addr,
                guest_name=guest_name,
                guest_phone=normalized_phone,
                guest_address=data.address if seller_delivery == "Доставка" else None,
                comment=(data.comment or "").strip() or None,
            )
            created.append({
                "order_id": order.id,
                "seller_id": seller_id,
                "total_price": float(order.total_price),
                "items_info": items_info,
            })

        await session.commit()

        # Send seller notifications (no buyer notification — guest has no Telegram)
        from backend.app.services.telegram_notify import notify_seller_new_order_guest
        for o in created:
            await notify_seller_new_order_guest(
                seller_id=o["seller_id"],
                order_id=o["order_id"],
                items_info=o["items_info"],
                total_price=o["total_price"],
                guest_name=guest_name,
                guest_phone=normalized_phone,
            )

        logger.info(
            "Guest checkout completed",
            guest_phone=normalized_phone,
            orders_count=len(created),
        )

        return {
            "orders": [
                {"order_id": o["order_id"], "seller_id": o["seller_id"], "total_price": o["total_price"]}
                for o in created
            ]
        }
    except OrderServiceError as e:
        await session.rollback()
        logger.warning("Guest checkout failed", error=e.message)
        _handle_service_error(e)
