from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.order import Order
from backend.app.models.seller import Seller
from sqlalchemy import select

async def create_new_order(session: AsyncSession, order_data: dict):
    """
    Создает новый заказ в базе данных.
    order_data должен содержать: buyer_id, seller_id, items_info, total_price и т.д.
    """
    new_order = Order(
        buyer_id=order_data['buyer_id'],
        seller_id=order_data['seller_id'],
        items_info=order_data['items_info'],
        total_price=order_data['total_price'],
        status='pending',
        delivery_type=order_data.get('delivery_type'),
        address=order_data.get('address')
    )
    session.add(new_order)
    
    # Сразу обновляем счетчик "ожидающих" заказов у продавца
    # (Это важно для лимитов, которые мы проверяем в sellers.py)
    seller_query = await session.execute(select(Seller).where(Seller.seller_id == order_data['seller_id']))
    seller = seller_query.scalar_one_or_none()
    if seller:
        seller.pending_requests += 1
        
    await session.commit()
    return new_order