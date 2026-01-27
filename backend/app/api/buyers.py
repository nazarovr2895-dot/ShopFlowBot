from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from pydantic import BaseModel

from backend.app.api.deps import get_session
from backend.app.core.logging import get_logger
from backend.app.schemas import BuyerCreate, BuyerResponse
from backend.app.core.auth import (
    TelegramInitData,
    get_current_user_optional,
    verify_user_id,
)
from backend.app.services.buyers import (
    BuyerService,
    BuyerServiceError,
    UserNotFoundError,
)

router = APIRouter()
logger = get_logger(__name__)


def _handle_service_error(e: BuyerServiceError):
    """Convert service exceptions to HTTP exceptions."""
    raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/{telegram_id}", response_model=Optional[BuyerResponse])
async def get_buyer(telegram_id: int, session: AsyncSession = Depends(get_session)):
    """Найти пользователя по Telegram ID"""
    service = BuyerService(session)
    user = await service.get_buyer(telegram_id)
    
    if not user:
        return None
    
    # Add id field for schema compatibility
    user.id = user.tg_id
    return user


@router.post("/register", response_model=BuyerResponse)
async def register_buyer(
    data: BuyerCreate,
    session: AsyncSession = Depends(get_session),
    current_user: Optional[TelegramInitData] = Depends(get_current_user_optional),
):
    """
    Создать или обновить пользователя.
    
    Если запрос приходит от аутентифицированного пользователя (Mini App),
    проверяем что tg_id совпадает с ID пользователя Telegram.
    """
    logger.info(
        "Registering buyer",
        tg_id=data.tg_id,
        username=data.username,
        has_referrer=data.referrer_id is not None,
    )
    
    # Validate that authenticated user can only register themselves
    if current_user:
        verify_user_id(current_user, data.tg_id)
    
    service = BuyerService(session)
    user = await service.register_buyer(
        tg_id=data.tg_id,
        username=data.username,
        fio=data.fio,
        referrer_id=data.referrer_id
    )
    
    logger.info("Buyer registered", tg_id=data.tg_id, role=user.role)
    
    # Add id field for schema compatibility
    user.id = user.tg_id
    return user


class AgentUpgrade(BaseModel):
    tg_id: int
    fio: str
    phone: str
    age: int
    is_self_employed: bool


@router.post("/upgrade_to_agent")
async def upgrade_to_agent(
    data: AgentUpgrade,
    session: AsyncSession = Depends(get_session),
    current_user: Optional[TelegramInitData] = Depends(get_current_user_optional),
):
    """
    Превращает покупателя в Агента.
    
    Если запрос приходит от аутентифицированного пользователя (Mini App),
    проверяем что tg_id совпадает с ID пользователя Telegram.
    """
    logger.info("Upgrading buyer to agent", tg_id=data.tg_id)
    
    # Validate that authenticated user can only upgrade themselves
    if current_user:
        verify_user_id(current_user, data.tg_id)
    
    service = BuyerService(session)
    
    try:
        result = await service.upgrade_to_agent(
            tg_id=data.tg_id,
            fio=data.fio,
            phone=data.phone,
            age=data.age,
            is_self_employed=data.is_self_employed
        )
        logger.info("Buyer upgraded to agent", tg_id=data.tg_id)
        return result
    except BuyerServiceError as e:
        logger.warning("Agent upgrade failed", tg_id=data.tg_id, error=e.message)
        _handle_service_error(e)
