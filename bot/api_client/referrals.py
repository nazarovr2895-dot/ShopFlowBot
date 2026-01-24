from backend.app.core.database import async_session
from backend.app.services.referrals import register_referral

async def api_register_ref_link(new_user_id: int, referrer_id: int):
    """Связывает нового пользователя с пригласившим"""
    async with async_session() as session:
        return await register_referral(session, new_user_id, referrer_id)

async def api_get_agent_balance(agent_id: int):
    """
    Заглушка для получения баланса. 
    Позже тут будет запрос к сервису commissions.
    """
    # Пока возвращаем 0, так как логику баланса еще не писали в сервисах
    return 0.0