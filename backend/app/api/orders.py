from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.api.deps import get_session
from backend.app.models.order import Order
from backend.app.models.seller import Seller
from backend.app.schemas import OrderCreate, OrderResponse

router = APIRouter()

# --- 1. СОЗДАНИЕ ЗАКАЗА ---
@router.post("/create", response_model=OrderResponse)
async def create_order(data: OrderCreate, session: AsyncSession = Depends(get_session)):
    """
    Создание заказа с проверкой лимитов и блокировкой продавца.
    """
    async with session.begin(): # Атомарная транзакция
        # Блокируем продавца для чтения/записи (SELECT ... FOR UPDATE)
        result = await session.execute(
            select(Seller).where(Seller.seller_id == data.seller_id).with_for_update()
        )
        seller = result.scalar_one_or_none()

        if not seller:
            raise HTTPException(404, "Seller not found")
        
        if seller.is_blocked:
            raise HTTPException(403, "Seller is blocked")

        # ПРОВЕРКА ЛИМИТОВ
        # Твои поля: pending_requests + active_orders
        current_load = seller.active_orders + seller.pending_requests
        
        if current_load >= seller.max_orders:
            # 409 Conflict - сервер не может выполнить запрос из-за конфликта состояния (лимит)
            raise HTTPException(409, "Seller is busy (limit reached)")

        # Увеличиваем счетчик ожидающих (Твое поле)
        seller.pending_requests += 1
        
        # Создаем заказ
        new_order = Order(
            buyer_id=data.buyer_id,
            seller_id=data.seller_id,
            items_info=data.items_info,
            total_price=data.total_price, # Decimal придет из схемы
            delivery_type=data.delivery_type,
            address=data.address,
            agent_id=data.agent_id,
            status="pending"  # Статус маленькими буквами
        )
        session.add(new_order)
        await session.flush() # Чтобы получить ID нового заказа
        
    return new_order

# --- 2. ПРИНЯТЬ ЗАКАЗ ---
@router.post("/{order_id}/accept")
async def accept_order(order_id: int, session: AsyncSession = Depends(get_session)):
    async with session.begin():
        order = await session.get(Order, order_id)
        if not order: 
            raise HTTPException(404, "Order not found")
        
        if order.status != "pending": 
            raise HTTPException(400, "Order is not in pending status")

        # Блокируем продавца, чтобы безопасно обновить счетчики
        res = await session.execute(
            select(Seller).where(Seller.seller_id == order.seller_id).with_for_update()
        )
        seller = res.scalar_one_or_none()

        # Обновляем счетчики: минус ожидание, плюс активный
        if seller.pending_requests > 0:
            seller.pending_requests -= 1
        
        seller.active_orders += 1
        
        order.status = "accepted"

    return {"status": "ok", "new_status": "accepted"}

# --- 3. ОТКЛОНИТЬ ЗАКАЗ ---
@router.post("/{order_id}/reject")
async def reject_order(order_id: int, session: AsyncSession = Depends(get_session)):
    async with session.begin():
        order = await session.get(Order, order_id)
        if not order: 
            raise HTTPException(404, "Order not found")
        
        # Отклонить можно только если заказ еще не принят
        if order.status != "pending": 
            raise HTTPException(400, "Can only reject pending orders")

        res = await session.execute(
            select(Seller).where(Seller.seller_id == order.seller_id).with_for_update()
        )
        seller = res.scalar_one_or_none()

        # Освобождаем слот ожидания
        if seller.pending_requests > 0:
            seller.pending_requests -= 1
        
        order.status = "rejected"

    return {"status": "ok", "new_status": "rejected"}

# --- 4. ЗАВЕРШИТЬ ЗАКАЗ ---
@router.post("/{order_id}/done")
async def done_order(order_id: int, session: AsyncSession = Depends(get_session)):
    async with session.begin():
        order = await session.get(Order, order_id)
        if not order: 
            raise HTTPException(404, "Order not found")
        
        # Завершить можно только принятый заказ
        if order.status != "accepted": 
            raise HTTPException(400, "Can only finish accepted orders")

        res = await session.execute(
            select(Seller).where(Seller.seller_id == order.seller_id).with_for_update()
        )
        seller = res.scalar_one_or_none()

        # Освобождаем слот "В работе" — продавец свободен
        if seller.active_orders > 0:
            seller.active_orders -= 1
        
        order.status = "done"

    return {"status": "ok", "new_status": "done"}