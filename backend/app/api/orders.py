from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from backend.app.api.deps import get_session
from backend.app.schemas import OrderCreate, OrderResponse
from backend.app.core.auth import (
    TelegramInitData,
    get_current_user_optional,
    verify_user_id,
)
from backend.app.core.logging import get_logger
from backend.app.services.orders import (
    OrderService,
    OrderServiceError,
    SellerNotFoundError,
    SellerBlockedError,
    SellerLimitReachedError,
    OrderNotFoundError,
    InvalidOrderStatusError,
)
from backend.app.services.referrals import accrue_commissions

router = APIRouter()
logger = get_logger(__name__)


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
            agent_id=data.agent_id,
        )
        logger.info("Order created successfully", order_id=order.id, buyer_id=data.buyer_id)
        return order
    except OrderServiceError as e:
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
async def accept_order(order_id: int, session: AsyncSession = Depends(get_session)):
    service = OrderService(session)
    
    try:
        result = await service.accept_order(order_id)
        return {
            "status": "ok",
            "new_status": result["new_status"],
            "buyer_id": result["buyer_id"],
            "items_info": result["items_info"],
            "total_price": result["total_price"],
            "original_price": result.get("original_price")
        }
    except OrderServiceError as e:
        _handle_service_error(e)


# --- 3. ОТКЛОНИТЬ ЗАКАЗ ---
@router.post("/{order_id}/reject")
async def reject_order(order_id: int, session: AsyncSession = Depends(get_session)):
    service = OrderService(session)
    
    try:
        result = await service.reject_order(order_id)
        return {
            "status": "ok",
            "new_status": result["new_status"],
            "buyer_id": result["buyer_id"],
            "items_info": result["items_info"],
            "total_price": result["total_price"]
        }
    except OrderServiceError as e:
        _handle_service_error(e)


# --- 4. ЗАВЕРШИТЬ ЗАКАЗ ---
@router.post("/{order_id}/done")
async def done_order(order_id: int, session: AsyncSession = Depends(get_session)):
    service = OrderService(session)
    
    try:
        result = await service.complete_order(order_id)
        return {
            "status": "ok",
            "new_status": result["new_status"],
            "buyer_id": result["buyer_id"],
            "items_info": result["items_info"],
            "total_price": result["total_price"]
        }
    except OrderServiceError as e:
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
    session: AsyncSession = Depends(get_session)
):
    """
    Изменить статус заказа.
    Допустимые статусы: pending, accepted, assembling, in_transit, done, completed, rejected
    - done: продавец отметил как выполненный
    - completed: покупатель подтвердил получение (начисляются комиссии агентам)
    """
    logger.info("Updating order status", order_id=order_id, new_status=status)
    service = OrderService(session)
    
    try:
        result = await service.update_status(
            order_id=order_id,
            new_status=status,
            accrue_commissions_func=accrue_commissions
        )
        logger.info(
            "Order status updated",
            order_id=order_id,
            new_status=result["new_status"],
            commissions_accrued=result["commissions_accrued"],
        )
        return {
            "status": "ok",
            "new_status": result["new_status"],
            "buyer_id": result["buyer_id"],
            "seller_id": result["seller_id"],
            "items_info": result["items_info"],
            "total_price": result["total_price"],
            "commissions_accrued": result["commissions_accrued"]
        }
    except OrderServiceError as e:
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
    session: AsyncSession = Depends(get_session)
):
    """
    Изменить цену заказа. Можно изменить только для заказов со статусом 'accepted'.
    """
    logger.info("Updating order price", order_id=order_id, new_price=new_price)
    service = OrderService(session)
    
    try:
        from decimal import Decimal
        result = await service.update_order_price(order_id, Decimal(str(new_price)))
        logger.info(
            "Order price updated",
            order_id=order_id,
            old_price=result.get("original_price"),
            new_price=result["total_price"]
        )
        return {
            "status": "ok",
            "order_id": result["order_id"],
            "buyer_id": result["buyer_id"],
            "total_price": result["total_price"],
            "original_price": result["original_price"]
        }
    except OrderServiceError as e:
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
