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
        
        # Сохраняем buyer_id для возврата
        buyer_id = order.buyer_id
        items_info = order.items_info
        total_price = float(order.total_price)

    return {
        "status": "ok", 
        "new_status": "accepted",
        "buyer_id": buyer_id,
        "items_info": items_info,
        "total_price": total_price
    }

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
        
        # Сохраняем buyer_id для возврата
        buyer_id = order.buyer_id
        items_info = order.items_info
        total_price = float(order.total_price)

    return {
        "status": "ok", 
        "new_status": "rejected",
        "buyer_id": buyer_id,
        "items_info": items_info,
        "total_price": total_price
    }

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
        
        # Сохраняем buyer_id для возврата
        buyer_id = order.buyer_id
        items_info = order.items_info
        total_price = float(order.total_price)

    return {
        "status": "ok", 
        "new_status": "done",
        "buyer_id": buyer_id,
        "items_info": items_info,
        "total_price": total_price
    }


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
    query = select(Order).where(Order.seller_id == seller_id)
    
    if status:
        query = query.where(Order.status == status)
    
    query = query.order_by(Order.created_at.desc())
    
    result = await session.execute(query)
    orders = result.scalars().all()
    
    # Возвращаем как список словарей
    return [
        {
            "id": o.id,
            "buyer_id": o.buyer_id,
            "seller_id": o.seller_id,
            "items_info": o.items_info,
            "total_price": float(o.total_price),
            "status": o.status,
            "delivery_type": o.delivery_type,
            "address": o.address,
            "created_at": o.created_at.isoformat() if o.created_at else None
        }
        for o in orders
    ]


# --- 6. СТАТИСТИКА ПРОДАВЦА (ВЫРУЧКА) ---
# --- 7. ЗАКАЗЫ ПОКУПАТЕЛЯ ---
@router.get("/buyer/{buyer_id}")
async def get_buyer_orders(
    buyer_id: int,
    session: AsyncSession = Depends(get_session)
):
    """Получить заказы покупателя"""
    query = select(Order).where(Order.buyer_id == buyer_id).order_by(Order.created_at.desc())
    result = await session.execute(query)
    orders = result.scalars().all()
    
    return [
        {
            "id": o.id,
            "buyer_id": o.buyer_id,
            "seller_id": o.seller_id,
            "items_info": o.items_info,
            "total_price": float(o.total_price),
            "status": o.status,
            "delivery_type": o.delivery_type,
            "address": o.address,
            "created_at": o.created_at.isoformat() if o.created_at else None
        }
        for o in orders
    ]


# --- 8. ИЗМЕНЕНИЕ СТАТУСА ЗАКАЗА ---
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
    from backend.app.services.referrals import accrue_commissions
    
    valid_statuses = ["pending", "accepted", "assembling", "in_transit", "done", "completed", "rejected"]
    
    if status not in valid_statuses:
        raise HTTPException(400, f"Invalid status. Must be one of: {valid_statuses}")
    
    commissions_accrued = []
    
    async with session.begin():
        order = await session.get(Order, order_id)
        if not order:
            raise HTTPException(404, "Order not found")
        
        old_status = order.status
        order.status = status
        
        # Если заказ завершен - уменьшаем счетчик активных заказов
        if status == "done" and old_status in ["accepted", "assembling", "in_transit"]:
            res = await session.execute(
                select(Seller).where(Seller.seller_id == order.seller_id).with_for_update()
            )
            seller = res.scalar_one_or_none()
            if seller and seller.active_orders > 0:
                seller.active_orders -= 1
        
        # Если покупатель подтвердил получение - начисляем комиссии агентам
        if status == "completed" and old_status != "completed":
            commissions_accrued = await accrue_commissions(
                session=session,
                order_total=float(order.total_price),
                buyer_id=order.buyer_id
            )
        
        # Сохраняем данные для возврата
        buyer_id = order.buyer_id
        seller_id = order.seller_id
        items_info = order.items_info
        total_price = float(order.total_price)
    
    return {
        "status": "ok", 
        "new_status": status,
        "buyer_id": buyer_id,
        "seller_id": seller_id,
        "items_info": items_info,
        "total_price": total_price,
        "commissions_accrued": commissions_accrued
    }


@router.get("/seller/{seller_id}/stats")
async def get_seller_order_stats(
    seller_id: int,
    session: AsyncSession = Depends(get_session)
):
    """
    Статистика заказов продавца: выручка, количество, комиссия 18%.
    """
    from sqlalchemy import func
    
    # Выручка по выполненным заказам (done + completed)
    result = await session.execute(
        select(
            func.count(Order.id).label("total_orders"),
            func.coalesce(func.sum(Order.total_price), 0).label("total_revenue")
        ).where(
            Order.seller_id == seller_id,
            Order.status.in_(["done", "completed"])
        )
    )
    row = result.one()
    
    total_orders = row.total_orders or 0
    total_revenue = float(row.total_revenue or 0)
    commission = round(total_revenue * 0.18, 2)  # 18% комиссия
    
    # Заказы по статусам
    status_result = await session.execute(
        select(
            Order.status,
            func.count(Order.id).label("count")
        ).where(Order.seller_id == seller_id).group_by(Order.status)
    )
    status_counts = {row.status: row.count for row in status_result}
    
    return {
        "total_completed_orders": total_orders,
        "total_revenue": total_revenue,
        "commission_18": commission,
        "net_revenue": round(total_revenue - commission, 2),
        "orders_by_status": status_counts
    }