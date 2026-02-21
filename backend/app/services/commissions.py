from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.models.settings import GlobalSettings
from backend.app.models.seller import Seller

DEFAULT_COMMISSION_PERCENT = 3


async def get_effective_commission_rate(
    session: AsyncSession,
    seller_id: Optional[int] = None,
) -> int:
    """
    Возвращает эффективный процент комиссии.
    Приоритет: индивидуальная комиссия продавца > глобальная настройка > дефолт (3%).
    """
    percent = DEFAULT_COMMISSION_PERCENT

    gs_result = await session.execute(select(GlobalSettings).order_by(GlobalSettings.id))
    settings = gs_result.scalar_one_or_none()
    if settings:
        percent = settings.commission_percent

    if seller_id is not None:
        seller = await session.get(Seller, seller_id)
        if seller and seller.commission_percent is not None:
            percent = seller.commission_percent

    return percent


async def calculate_platform_commission(
    session: AsyncSession,
    order_total: float,
    seller_id: Optional[int] = None,
) -> float:
    """
    Считает комиссию платформы.
    Приоритет: индивидуальная комиссия продавца > глобальная настройка > дефолт (3%).
    """
    percent = await get_effective_commission_rate(session, seller_id)
    return order_total * (percent / 100)
