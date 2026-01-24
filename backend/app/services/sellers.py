from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.models.seller import Seller

async def check_seller_limit(session: AsyncSession, seller_id: int) -> bool:
    """
    Проверяет, может ли продавец принять новый заказ.
    Возвращает True, если лимит НЕ превышен.
    Логика: active_orders + pending_requests < max_orders
    """
    query = await session.execute(select(Seller).where(Seller.seller_id == seller_id))
    seller = query.scalar_one_or_none()

    if not seller:
        return False  # Продавец не найден

    current_load = seller.active_orders + seller.pending_requests
    
    # Если max_orders = 0, считаем что лимита нет (или наоборот, заблокирован - зависит от твоей логики).
    # Обычно 0 значит безлимит, но по твоей формуле это будет false. 
    # Сделаем строго по формуле из PDF:
    if current_load < seller.max_orders:
        return True
    
    return False

async def get_seller_data(session: AsyncSession, seller_id: int):
    """Получает данные продавца для отображения в боте"""
    query = await session.execute(select(Seller).where(Seller.seller_id == seller_id))
    return query.scalar_one_or_none()