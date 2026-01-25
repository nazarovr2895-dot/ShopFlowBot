from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from backend.app.api.deps import get_session
from backend.app.models.user import User
from pydantic import BaseModel
from decimal import Decimal

router = APIRouter()

class AgentStats(BaseModel):
    balance: Decimal
    referrals_count_level_1: int
    # referrals_count_level_2: int # На будущее

@router.get("/{agent_id}/stats", response_model=AgentStats)
async def get_agent_stats(agent_id: int, session: AsyncSession = Depends(get_session)):
    """
    Возвращает баланс и количество рефералов 1-го уровня
    """
    # 1. Получаем самого агента (баланс)
    result = await session.execute(select(User).where(User.tg_id == agent_id))
    agent = result.scalar_one_or_none()
    
    if not agent:
        return AgentStats(balance=0, referrals_count_level_1=0)

    # 2. Считаем, сколько людей у него в referrals (Level 1)
    # SELECT count(*) FROM users WHERE referrer_id = agent_id
    query = select(func.count()).select_from(User).where(User.referrer_id == agent_id)
    count_res = await session.execute(query)
    count = count_res.scalar()

    return AgentStats(
        balance=agent.balance,
        referrals_count_level_1=count or 0
    )