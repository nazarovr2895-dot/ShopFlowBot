from backend.app.core.database import async_session
from backend.app.services.sellers import check_seller_limit, get_seller_data
# Импортируем только что созданный сервис товаров
from backend.app.services.products import create_product_service, get_products_by_seller_service, delete_product_service
from backend.app.models.seller import Seller # Для админки

async def api_get_seller(tg_id: int):
    """Получает данные продавца"""
    async with async_session() as session:
        return await get_seller_data(session, tg_id)

async def api_check_limit(seller_id: int) -> bool:
    """Проверяет лимиты заказов"""
    async with async_session() as session:
        return await check_seller_limit(session, seller_id)

# --- ТОВАРЫ ---

async def api_create_product(seller_id: int, name: str, price: float, description: str, photo_id: str):
    data = {
        "seller_id": seller_id,
        "name": name,
        "price": price,
        "description": description,
        "photo_id": photo_id
    }
    async with async_session() as session:
        await create_product_service(session, data)

async def api_get_my_products(seller_id: int):
    """Товары для личного кабинета продавца"""
    async with async_session() as session:
        return await get_products_by_seller_service(session, seller_id)

async def api_get_products(seller_id: int):
    """Товары для каталога покупателя (то же самое, но название другое для ясности)"""
    async with async_session() as session:
        return await get_products_by_seller_service(session, seller_id)

async def api_delete_product(product_id: int):
    async with async_session() as session:
        return await delete_product_service(session, product_id)

# --- АДМИНКА (Создание продавцов) ---

async def api_create_seller(tg_id: int, fio: str, phone: str, shop_name: str, delivery_type: str):
    """Создает продавца (админская функция)"""
    async with async_session() as session:
        # Проверяем, есть ли уже такой
        existing = await get_seller_data(session, tg_id)
        if existing:
            return False
            
        new_seller = Seller(
            seller_id=tg_id,
            shop_name=shop_name,
            delivery_type=delivery_type,
            max_orders=10, # Старт с 10 заказов
            active_orders=0
        )
        session.add(new_seller)
        await session.commit()
        return True

async def api_update_seller_status(tg_id: int, is_blocked: bool):
    """Блокировка/Разблокировка"""
    async with async_session() as session:
        seller = await get_seller_data(session, tg_id)
        if seller:
            seller.is_blocked = is_blocked
            await session.commit()
            return True
        return False