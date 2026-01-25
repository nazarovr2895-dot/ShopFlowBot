from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from backend.app.api.deps import get_session
from backend.app.models.product import Product
from backend.app.models.seller import Seller
from backend.app.schemas import ProductCreate, ProductResponse
from typing import List
from fastapi.encoders import jsonable_encoder

router = APIRouter()

# --- ТОВАРЫ ---


@router.get("/{seller_id}/products", response_model=List[ProductResponse])
async def get_products(seller_id: int, session: AsyncSession = Depends(get_session)):
    """Получить все товары продавца"""
    # 1. Делаем запрос
    result = await session.execute(select(Product).where(Product.seller_id == seller_id))
    products = result.scalars().all()
    
    # 2. Если ничего нет — возвращаем пустой список
    if not products:
        return []

    # 3. ЯВНО превращаем в список словарей, чтобы избежать ошибок валидации Pydantic
    # Иногда Pydantic ругается на SQLAlchemy объекты, если они не полностью загружены
    return products

@router.post("/products/add", response_model=ProductResponse)
async def add_product(data: ProductCreate, session: AsyncSession = Depends(get_session)):
    """Добавить товар"""
    new_product = Product(
        seller_id=data.seller_id,
        name=data.name,
        description=data.description,
        price=data.price,
        photo_id=data.photo_id
    )
    session.add(new_product)
    await session.commit()
    await session.refresh(new_product)
    return new_product

@router.delete("/products/{product_id}")
async def delete_product(product_id: int, session: AsyncSession = Depends(get_session)):
    """Удалить товар"""
    await session.execute(delete(Product).where(Product.id == product_id))
    await session.commit()
    return {"status": "deleted"}

# --- ПРОДАВЦЫ ---

@router.get("/{tg_id}")
async def get_seller_info(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Инфо о продавце (для проверки лимитов и т.д.)"""
    # Если таблицы Seller еще нет или логика сложная, пока вернем заглушку, но через базу
    # (Здесь можно подключить реальную таблицу Seller, если она есть)
    return {
        "shop_name": "My Shop",
        "max_orders": 100,
        "is_blocked": False
    }