from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from backend.app.api.deps import get_session
from backend.app.models.user import User
from backend.app.models.order import Order
from pydantic import BaseModel
from decimal import Decimal
from typing import List, Optional

router = APIRouter()


class InvitedAgentInfo(BaseModel):
    """Информация о приглашенном агенте"""
    tg_id: int
    fio: Optional[str]
    referrals_count: int  # Сколько людей пригласил этот агент
    total_orders: int     # Общий оборот заказов от его рефералов


class AgentStats(BaseModel):
    balance: Decimal
    referrals_count_level_1: int      # Прямые рефералы (покупатели)
    referrals_count_level_2: int      # Рефералы приглашенных агентов
    agents_invited: int               # Количество приглашенных агентов
    earnings_level_1: Decimal         # Заработок с Level 1 (7%)
    earnings_level_2: Decimal         # Заработок с Level 2 (2%)
    invited_agents: List[InvitedAgentInfo]  # Список приглашенных агентов


@router.get("/{agent_id}/stats", response_model=AgentStats)
async def get_agent_stats(agent_id: int, session: AsyncSession = Depends(get_session)):
    """
    Возвращает детальную статистику агента:
    - Баланс (общий)
    - Рефералы Level 1 (прямые)
    - Рефералы Level 2 (от приглашенных агентов)
    - Заработок Level 1 (7% от заказов прямых рефералов)
    - Заработок Level 2 (2% от заказов рефералов агентов)
    - Список приглашенных агентов с их статистикой
    """
    # 1. Получаем самого агента
    result = await session.execute(select(User).where(User.tg_id == agent_id))
    agent = result.scalar_one_or_none()
    
    if not agent:
        return AgentStats(
            balance=Decimal(0),
            referrals_count_level_1=0,
            referrals_count_level_2=0,
            agents_invited=0,
            earnings_level_1=Decimal(0),
            earnings_level_2=Decimal(0),
            invited_agents=[]
        )

    # 2. Получаем прямых рефералов (Level 1) - все пользователи с referrer_id = agent_id
    level1_query = select(User).where(User.referrer_id == agent_id)
    level1_result = await session.execute(level1_query)
    level1_users = level1_result.scalars().all()
    
    level1_count = len(level1_users)
    level1_user_ids = [u.tg_id for u in level1_users]
    
    # 3. Считаем заработок Level 1 (7% от выполненных заказов прямых рефералов)
    earnings_level_1 = Decimal(0)
    if level1_user_ids:
        level1_orders_query = select(
            func.coalesce(func.sum(Order.total_price), 0)
        ).where(
            Order.buyer_id.in_(level1_user_ids),
            Order.status.in_(["done", "completed"])
        )
        level1_orders_result = await session.execute(level1_orders_query)
        level1_total = level1_orders_result.scalar() or 0
        earnings_level_1 = Decimal(str(level1_total)) * Decimal("0.07")
    
    # 4. Находим приглашенных агентов (Level 1 рефералы с role='AGENT')
    invited_agents_list = [u for u in level1_users if u.role == 'AGENT']
    agents_invited = len(invited_agents_list)
    invited_agent_ids = [u.tg_id for u in invited_agents_list]
    
    # 5. Получаем Level 2 рефералов (пользователи, приглашенные агентами)
    level2_count = 0
    earnings_level_2 = Decimal(0)
    invited_agents_info = []
    
    if invited_agent_ids:
        # Рефералы второго уровня
        level2_query = select(User).where(User.referrer_id.in_(invited_agent_ids))
        level2_result = await session.execute(level2_query)
        level2_users = level2_result.scalars().all()
        level2_count = len(level2_users)
        level2_user_ids = [u.tg_id for u in level2_users]
        
        # Заработок Level 2 (2% от заказов рефералов агентов)
        if level2_user_ids:
            level2_orders_query = select(
                func.coalesce(func.sum(Order.total_price), 0)
            ).where(
                Order.buyer_id.in_(level2_user_ids),
                Order.status.in_(["done", "completed"])
            )
            level2_orders_result = await session.execute(level2_orders_query)
            level2_total = level2_orders_result.scalar() or 0
            earnings_level_2 = Decimal(str(level2_total)) * Decimal("0.02")
        
        # Собираем информацию о каждом приглашенном агенте
        for invited_agent in invited_agents_list:
            # Количество рефералов у этого агента
            agent_referrals_query = select(func.count()).select_from(User).where(
                User.referrer_id == invited_agent.tg_id
            )
            agent_ref_result = await session.execute(agent_referrals_query)
            agent_ref_count = agent_ref_result.scalar() or 0
            
            # Оборот заказов от рефералов этого агента
            agent_ref_ids_query = select(User.tg_id).where(User.referrer_id == invited_agent.tg_id)
            agent_ref_ids_result = await session.execute(agent_ref_ids_query)
            agent_ref_ids = [r[0] for r in agent_ref_ids_result.fetchall()]
            
            agent_orders_total = 0
            if agent_ref_ids:
                agent_orders_query = select(
                    func.count(Order.id)
                ).where(
                    Order.buyer_id.in_(agent_ref_ids),
                    Order.status.in_(["done", "completed"])
                )
                agent_orders_result = await session.execute(agent_orders_query)
                agent_orders_total = agent_orders_result.scalar() or 0
            
            invited_agents_info.append(InvitedAgentInfo(
                tg_id=invited_agent.tg_id,
                fio=invited_agent.fio,
                referrals_count=agent_ref_count,
                total_orders=agent_orders_total
            ))

    return AgentStats(
        balance=agent.balance,
        referrals_count_level_1=level1_count,
        referrals_count_level_2=level2_count,
        agents_invited=agents_invited,
        earnings_level_1=round(earnings_level_1, 2),
        earnings_level_2=round(earnings_level_2, 2),
        invited_agents=invited_agents_info
    )