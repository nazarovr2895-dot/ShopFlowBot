# backend/app/services/agents.py
"""
Agent service - handles all agent/referral-related business logic.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import Optional, List, Dict, Any

from backend.app.models.user import User
from backend.app.models.order import Order


class AgentServiceError(Exception):
    """Base exception for agent service errors."""
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class AgentNotFoundError(AgentServiceError):
    def __init__(self, tg_id: int):
        super().__init__(f"Agent {tg_id} not found", 404)


class NotAnAgentError(AgentServiceError):
    def __init__(self, tg_id: int):
        super().__init__(f"User {tg_id} is not an agent", 400)


class AgentService:
    """Service class for agent operations."""
    
    # Commission percentages
    LEVEL_1_COMMISSION = 0.07  # 7% for direct referrals
    LEVEL_2_COMMISSION = 0.02  # 2% for second-level referrals
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def list_all_agents(self) -> List[Dict[str, Any]]:
        """
        Get list of all agents with referral counts.
        Uses subquery to avoid N+1 problem.
        """
        # Subquery for referral counts
        referrals_subq = (
            select(User.referrer_id, func.count().label("ref_count"))
            .where(User.referrer_id.isnot(None))
            .group_by(User.referrer_id)
            .subquery()
        )
        
        # Main query with LEFT JOIN
        query = (
            select(User, func.coalesce(referrals_subq.c.ref_count, 0).label("referrals_count"))
            .outerjoin(referrals_subq, User.tg_id == referrals_subq.c.referrer_id)
            .where(User.role == 'AGENT')
        )
        
        result = await self.session.execute(query)
        
        return [
            {
                "tg_id": agent.tg_id,
                "fio": agent.fio,
                "phone": agent.phone,
                "age": agent.age,
                "is_self_employed": agent.is_self_employed or False,
                "balance": float(agent.balance) if agent.balance else 0.0,
                "referrals_count": referrals_count,
                "created_at": agent.created_at.isoformat() if agent.created_at else None
            }
            for agent, referrals_count in result.all()
        ]
    
    async def search_agents(self, query_str: str) -> List[Dict[str, Any]]:
        """
        Search agents by name or Telegram ID.
        Uses subquery to avoid N+1 problem.
        """
        # Subquery for referral counts
        referrals_subq = (
            select(User.referrer_id, func.count().label("ref_count"))
            .where(User.referrer_id.isnot(None))
            .group_by(User.referrer_id)
            .subquery()
        )
        
        # Main query
        base_query = (
            select(User, func.coalesce(referrals_subq.c.ref_count, 0).label("referrals_count"))
            .outerjoin(referrals_subq, User.tg_id == referrals_subq.c.referrer_id)
            .where(User.role == 'AGENT')
        )
        
        # Add search condition
        if query_str.isdigit():
            base_query = base_query.where(
                or_(User.fio.ilike(f"%{query_str}%"), User.tg_id == int(query_str))
            )
        else:
            base_query = base_query.where(User.fio.ilike(f"%{query_str}%"))
        
        result = await self.session.execute(base_query)
        
        return [
            {
                "tg_id": agent.tg_id,
                "fio": agent.fio,
                "phone": agent.phone,
                "age": agent.age,
                "is_self_employed": agent.is_self_employed or False,
                "balance": float(agent.balance) if agent.balance else 0.0,
                "referrals_count": referrals_count,
                "created_at": agent.created_at.isoformat() if agent.created_at else None
            }
            for agent, referrals_count in result.all()
        ]
    
    async def get_agent_details(self, tg_id: int) -> Dict[str, Any]:
        """
        Get detailed information about an agent including:
        - Personal info
        - Level 1 referrals count and earnings
        - Level 2 referrals count and earnings
        - List of invited agents
        """
        # Get agent
        result = await self.session.execute(
            select(User).where(User.tg_id == tg_id)
        )
        agent = result.scalar_one_or_none()
        
        if not agent:
            raise AgentNotFoundError(tg_id)
        
        # Get Level 1 referrals (direct)
        level1_result = await self.session.execute(
            select(User).where(User.referrer_id == tg_id)
        )
        level1_users = level1_result.scalars().all()
        level1_count = len(level1_users)
        level1_ids = [u.tg_id for u in level1_users]
        
        # Find invited agents among Level 1
        invited_agents = [u for u in level1_users if u.role == 'AGENT']
        agents_invited = len(invited_agents)
        invited_agent_ids = [u.tg_id for u in invited_agents]
        
        # Get Level 2 referrals (referrals of invited agents)
        level2_count = 0
        if invited_agent_ids:
            level2_result = await self.session.execute(
                select(func.count())
                .select_from(User)
                .where(User.referrer_id.in_(invited_agent_ids))
            )
            level2_count = level2_result.scalar() or 0
        
        # Calculate Level 1 earnings (7% from direct referrals' orders)
        earnings_level_1 = 0.0
        if level1_ids:
            level1_orders_result = await self.session.execute(
                select(func.coalesce(func.sum(Order.total_price), 0))
                .where(
                    Order.buyer_id.in_(level1_ids),
                    Order.status.in_(["done", "completed", "delivered"])
                )
            )
            level1_total = level1_orders_result.scalar() or 0
            earnings_level_1 = float(level1_total) * self.LEVEL_1_COMMISSION
        
        # Calculate Level 2 earnings (2% from indirect referrals' orders)
        earnings_level_2 = 0.0
        if invited_agent_ids:
            # Get IDs of Level 2 referrals
            level2_ids_result = await self.session.execute(
                select(User.tg_id).where(User.referrer_id.in_(invited_agent_ids))
            )
            level2_ids = [r[0] for r in level2_ids_result.fetchall()]
            
            if level2_ids:
                level2_orders_result = await self.session.execute(
                    select(func.coalesce(func.sum(Order.total_price), 0))
                    .where(
                        Order.buyer_id.in_(level2_ids),
                        Order.status.in_(["done", "completed", "delivered"])
                    )
                )
                level2_total = level2_orders_result.scalar() or 0
                earnings_level_2 = float(level2_total) * self.LEVEL_2_COMMISSION
        
        # Get invited agents info with their referral counts (avoid N+1)
        invited_agents_info = []
        if invited_agent_ids:
            inv_referrals_subq = (
                select(User.referrer_id, func.count().label("ref_count"))
                .where(User.referrer_id.in_(invited_agent_ids))
                .group_by(User.referrer_id)
                .subquery()
            )
            
            inv_stats_result = await self.session.execute(
                select(inv_referrals_subq.c.referrer_id, inv_referrals_subq.c.ref_count)
            )
            inv_ref_counts = {row[0]: row[1] for row in inv_stats_result.all()}
            
            for inv_agent in invited_agents:
                invited_agents_info.append({
                    "tg_id": inv_agent.tg_id,
                    "fio": inv_agent.fio,
                    "referrals_count": inv_ref_counts.get(inv_agent.tg_id, 0)
                })
        
        return {
            "status": "ok",
            "agent": {
                "tg_id": agent.tg_id,
                "fio": agent.fio,
                "phone": agent.phone,
                "age": agent.age,
                "is_self_employed": agent.is_self_employed or False,
                "balance": float(agent.balance) if agent.balance else 0.0,
                "created_at": agent.created_at.isoformat() if agent.created_at else None
            },
            "stats": {
                "referrals_level_1": level1_count,
                "referrals_level_2": level2_count,
                "agents_invited": agents_invited,
                "earnings_level_1": round(earnings_level_1, 2),
                "earnings_level_2": round(earnings_level_2, 2),
                "total_earnings": round(earnings_level_1 + earnings_level_2, 2)
            },
            "invited_agents": invited_agents_info
        }
    
    async def get_agent_referrals(self, tg_id: int) -> Dict[str, Any]:
        """
        Get list of agent's referrals with their order statistics.
        Uses subquery to avoid N+1 problem.
        """
        # Check if agent exists
        agent = await self.session.get(User, tg_id)
        if not agent:
            raise AgentNotFoundError(tg_id)
        
        # Subquery for order statistics
        orders_subq = (
            select(
                Order.buyer_id,
                func.count(Order.id).label("orders_count"),
                func.coalesce(func.sum(Order.total_price), 0).label("orders_sum")
            )
            .where(Order.status.in_(["done", "completed", "delivered"]))
            .group_by(Order.buyer_id)
            .subquery()
        )
        
        # Main query with LEFT JOIN
        query = (
            select(
                User,
                func.coalesce(orders_subq.c.orders_count, 0).label("orders_count"),
                func.coalesce(orders_subq.c.orders_sum, 0).label("orders_sum")
            )
            .outerjoin(orders_subq, User.tg_id == orders_subq.c.buyer_id)
            .where(User.referrer_id == tg_id)
        )
        
        result = await self.session.execute(query)
        
        referrals_list = [
            {
                "tg_id": ref.tg_id,
                "fio": ref.fio,
                "role": ref.role,
                "orders_count": orders_count,
                "orders_sum": float(orders_sum) if orders_sum else 0.0,
                "created_at": ref.created_at.isoformat() if ref.created_at else None
            }
            for ref, orders_count, orders_sum in result.all()
        ]
        
        return {
            "status": "ok",
            "referrals": referrals_list,
            "total": len(referrals_list)
        }
    
    async def remove_agent_status(self, tg_id: int) -> Dict[str, str]:
        """
        Remove agent status (demote to BUYER).
        Does not delete user, only changes role.
        """
        user = await self.session.get(User, tg_id)
        if not user:
            raise AgentNotFoundError(tg_id)
        
        if user.role != 'AGENT':
            raise NotAnAgentError(tg_id)
        
        user.role = 'BUYER'
        await self.session.commit()
        
        return {"status": "ok", "message": "Статус агента снят"}
    
    async def set_balance(self, tg_id: int, new_balance: float) -> Dict[str, Any]:
        """
        Set agent's balance (for admin corrections).
        """
        user = await self.session.get(User, tg_id)
        if not user:
            raise AgentNotFoundError(tg_id)
        
        if new_balance < 0:
            raise AgentServiceError("Баланс не может быть отрицательным")
        
        user.balance = new_balance
        await self.session.commit()
        
        return {"status": "ok", "new_balance": new_balance}
    
    async def get_agents_stats(self) -> List[Dict[str, Any]]:
        """
        Get statistics for all agents (orders through their referrals).
        """
        result = await self.session.execute(
            select(
                User.fio,
                func.count(Order.id).label('orders_count'),
                func.sum(Order.total_price).label('total_sales')
            )
            .join(Order, User.tg_id == Order.agent_id)
            .where(Order.status == 'delivered', Order.agent_id.isnot(None))
            .group_by(User.fio)
        )
        
        return [
            {
                "fio": row.fio,
                "orders_count": row.orders_count,
                "total_sales": float(row.total_sales) if row.total_sales else 0.0
            }
            for row in result.all()
        ]
