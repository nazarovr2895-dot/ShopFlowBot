from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.models.settings import GlobalSettings

async def calculate_platform_commission(session: AsyncSession, order_total: float) -> float:
    """
    Считает комиссию платформы на основе настроек в БД.
    Если настроек нет, берет стандартные 18%.
    """
    query = await session.execute(select(GlobalSettings).order_by(GlobalSettings.id))
    settings = query.scalar_one_or_none()
    
    # Если настройки есть в базе, берем оттуда, иначе 18% по умолчанию
    percent = settings.commission_percent if settings else 18
    
    commission_amount = order_total * (percent / 100)
    return commission_amount