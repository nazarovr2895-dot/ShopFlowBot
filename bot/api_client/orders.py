# Временно импортируем сервисы напрямую, чтобы проверить логику
# Позже заменим на HTTP запросы: await client._post('/orders', data)
from backend.app.services.orders import create_new_order
from backend.app.core.database import async_session

async def api_create_order(order_data: dict):
    """
    Бот вызывает эту функцию. Она создает сессию и вызывает сервис.
    """
    async with async_session() as session:
        return await create_new_order(session, order_data)