from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.models.referral import Referral
from backend.app.models.user import User

async def register_referral(session: AsyncSession, new_user_id: int, referrer_id: int):
    """
    Регистрирует связь "кто кого пригласил".
    Срабатывает 1 раз навсегда.
    """
    # Сначала проверяем, не является ли юзер уже чьим-то рефералом
    query = await session.execute(select(Referral).where(Referral.referred_id == new_user_id))
    existing_ref = query.scalar_one_or_none()
    
    if existing_ref:
        return False # Уже есть реферрер, нельзя поменять
        
    # Создаем запись
    new_ref = Referral(
        referrer_id=referrer_id,
        referred_id=new_user_id
    )
    session.add(new_ref)
    await session.commit()
    return True

async def calculate_rewards(session: AsyncSession, order_total: float, buyer_id: int):
    """
    Рассчитывает комиссию:
    1. Находит агента, пригласившего покупателя (уровень 1) -> 7%
    2. Находит того, кто пригласил агента (уровень 2) -> 2%
    Возвращает список словарей: [{'user_id': 123, 'amount': 70.0}, ...]
    """
    rewards = []
    
    # 1. Ищем прямого агента (кто пригласил покупателя)
    q1 = await session.execute(select(Referral).where(Referral.referred_id == buyer_id))
    level1_ref = q1.scalar_one_or_none()
    
    if level1_ref:
        agent_id = level1_ref.referrer_id
        amount_level1 = order_total * 0.07  # 7%
        rewards.append({'user_id': agent_id, 'amount': amount_level1, 'role': 'agent', 'referral_id': level1_ref.id})
        
        # 2. Ищем вышестоящего (кто пригласил этого агента)
        q2 = await session.execute(select(Referral).where(Referral.referred_id == agent_id))
        level2_ref = q2.scalar_one_or_none()
        
        if level2_ref:
            upline_id = level2_ref.referrer_id
            amount_level2 = order_total * 0.02  # 2%
            rewards.append({'user_id': upline_id, 'amount': amount_level2, 'role': 'upline', 'referral_id': level2_ref.id})
            
    return rewards


async def accrue_commissions(session: AsyncSession, order_total: float, buyer_id: int) -> list:
    """
    Начисляет комиссии агентам при завершении заказа (status = completed).
    
    Обновляет:
    - User.balance для каждого агента (Level 1 и Level 2)
    - Referral.total_earned для учета заработка с конкретного реферала
    
    Возвращает список начисленных комиссий для отладки/логирования:
    [{'user_id': 123, 'amount': 70.0, 'level': 1}, ...]
    """
    # Получаем расчет комиссий
    rewards = await calculate_rewards(session, order_total, buyer_id)
    
    accrued = []
    
    for i, reward in enumerate(rewards):
        user_id = reward['user_id']
        amount = reward['amount']
        referral_id = reward.get('referral_id')
        level = i + 1  # Level 1 = direct agent, Level 2 = upline
        
        # 1. Обновляем баланс агента
        user = await session.get(User, user_id)
        if user:
            # Преобразуем Decimal в float для сложения
            current_balance = float(user.balance) if user.balance else 0.0
            user.balance = current_balance + amount
        
        # 2. Обновляем total_earned в Referral (только для Level 1 - прямой реферал)
        # Level 2 - это заработок с заказа чужого реферала, не обновляем total_earned
        if level == 1 and referral_id:
            referral = await session.get(Referral, referral_id)
            if referral:
                current_earned = float(referral.total_earned) if referral.total_earned else 0.0
                referral.total_earned = current_earned + amount
        
        accrued.append({
            'user_id': user_id,
            'amount': round(amount, 2),
            'level': level,
            'role': reward['role']
        })
    
    return accrued