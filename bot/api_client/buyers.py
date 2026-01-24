from backend.app.core.database import async_session
from backend.app.services.buyers import create_buyer, get_buyer

async def api_get_user(tg_id: int):
    """Получает пользователя по ID"""
    async with async_session() as session:
        return await get_buyer(session, tg_id)

async def api_register_user(tg_id: int, username: str, fio: str = None):
    """Регистрирует пользователя, если его нет"""
    async with async_session() as session:
        user = await get_buyer(session, tg_id)
        if user:
            return user
        
        data = {"tg_id": tg_id, "username": username, "fio": fio}
        return await create_buyer(session, data)