from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.api.deps import get_session
from backend.app.models.user import User
from backend.app.schemas import BuyerCreate, BuyerResponse
from typing import Optional

router = APIRouter()

@router.get("/{telegram_id}", response_model=Optional[BuyerResponse])
async def get_buyer(telegram_id: int, session: AsyncSession = Depends(get_session)):
    """Найти пользователя по Telegram ID"""
    result = await session.execute(select(User).where(User.tg_id == telegram_id))
    user = result.scalar_one_or_none()
    
    if not user:
        return None
    
    # Мы возвращаем ORM-объект, а Pydantic (BuyerResponse) сам достанет из него
    # balance, referrer_id и tg_id.
    # Важно: в схеме у нас есть поле 'id', в модели его нет (есть tg_id).
    # Для совместимости FastAPI может использовать tg_id как id, либо мы можем добавить алиас.
    # Но пока просто вернем объект, так как поля совпадают по именам.
    # Для поля 'id' в BuyerResponse мы временно передадим tg_id вручную, если Pydantic запутается,
    # но лучше всего просто вернуть объект.
    
    # Маленький хак, чтобы схема BuyerResponse (которая ждет id) не ругалась,
    # так как в модели User поля id нет, есть только tg_id.
    user.id = user.tg_id 
    return user

@router.post("/register", response_model=BuyerResponse)
async def register_buyer(data: BuyerCreate, session: AsyncSession = Depends(get_session)):
    """Создать или обновить пользователя"""
    # 1. Проверяем, есть ли такой
    result = await session.execute(select(User).where(User.tg_id == data.tg_id))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        # Если юзер уже есть, мы НЕ меняем его реферала (привязка навсегда)
        existing_user.id = existing_user.tg_id # Для схемы
        return existing_user

    # 2. Логика Реферала
    ref_id = data.referrer_id
    
    # Защита: нельзя стать рефералом самого себя
    if ref_id == data.tg_id:
        ref_id = None
        
    # 3. Создаем нового
    new_user = User(
        tg_id=data.tg_id,
        username=data.username,
        fio=data.fio,
        role="BUYER",
        referrer_id=ref_id, # <--- Записываем, от кого пришел
        balance=0           # Начальный баланс
    )
    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)
    
    new_user.id = new_user.tg_id # Для схемы
    return new_user

# 👇 Добавь эту Pydantic схему прямо в этот файл (или в schemas.py, но можно и тут для скорости)
from pydantic import BaseModel

class AgentUpgrade(BaseModel):
    tg_id: int
    fio: str
    phone: str
    age: int
    is_self_employed: bool

@router.post("/upgrade_to_agent")
async def upgrade_to_agent(data: AgentUpgrade, session: AsyncSession = Depends(get_session)):
    """Превращает покупателя в Агента"""
    result = await session.execute(select(User).where(User.tg_id == data.tg_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Обновляем данные анкеты
    user.fio = data.fio
    user.phone = data.phone
    user.age = data.age
    user.is_self_employed = data.is_self_employed
    
    # МЕНЯЕМ РОЛЬ
    user.role = "AGENT"
    
    await session.commit()
    return {"status": "ok", "role": "AGENT"}