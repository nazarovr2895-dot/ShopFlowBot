from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.models.user import User

async def get_buyer(session: AsyncSession, tg_id: int):
    """Находит пользователя по ID"""
    result = await session.execute(select(User).where(User.tg_id == tg_id))
    return result.scalar_one_or_none()

async def create_buyer(session: AsyncSession, user_data: dict):
    """Создает нового пользователя (покупателя)"""
    new_user = User(
        tg_id=user_data['tg_id'],
        username=user_data.get('username'),
        fio=user_data.get('fio'),
        role='BUYER'
    )
    session.add(new_user)
    await session.commit()
    return new_user