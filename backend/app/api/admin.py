from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.api.deps import get_session
from backend.app.models.seller import Seller
from backend.app.models.user import User
from pydantic import BaseModel

router = APIRouter()

class SellerCreateSchema(BaseModel):
    tg_id: int
    shop_name: str
    delivery_type: str

@router.post("/create_seller")
async def create_seller_api(data: SellerCreateSchema, session: AsyncSession = Depends(get_session)):
    # 1. Проверяем, есть ли такой продавец
    result = await session.execute(select(Seller).where(Seller.seller_id == data.tg_id))
    if result.scalar_one_or_none():
        return {"status": "exists"}

    # 2. Создаем продавца
    new_seller = Seller(
        seller_id=data.tg_id,
        shop_name=data.shop_name,
        delivery_type=data.delivery_type,
        max_orders=10,
        active_orders=0
    )
    session.add(new_seller)

    # 3. Также обновляем роль юзера на SELLER (или ADMIN, если это админ)
    # Но обычно продавцу дают роль SELLER. 
    # Важно: Не понижать роль Админа.
    user_res = await session.execute(select(User).where(User.tg_id == data.tg_id))
    user = user_res.scalar_one_or_none()
    if user and user.role != 'ADMIN':
        user.role = 'SELLER'
        session.add(user)

    await session.commit()
    return {"status": "ok"}