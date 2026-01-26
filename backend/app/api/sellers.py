from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from backend.app.api.deps import get_session
from backend.app.models.product import Product
from backend.app.models.seller import Seller
from backend.app.schemas import ProductCreate, ProductUpdate, ProductResponse
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

@router.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(product_id: int, session: AsyncSession = Depends(get_session)):
    """Получить товар по ID"""
    result = await session.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    
    return product


@router.put("/products/{product_id}", response_model=ProductResponse)
async def update_product(product_id: int, data: ProductUpdate, session: AsyncSession = Depends(get_session)):
    """Обновить товар"""
    result = await session.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    
    # Обновляем только переданные поля
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(product, field, value)
    
    await session.commit()
    await session.refresh(product)
    return product


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
    result = await session.execute(
        select(Seller).where(Seller.seller_id == tg_id)
    )
    seller = result.scalar_one_or_none()
    
    if not seller:
        return None
    
    return {
        "seller_id": seller.seller_id,
        "shop_name": seller.shop_name or "My Shop",
        "description": seller.description,
        "max_orders": seller.max_orders,
        "active_orders": seller.active_orders,
        "pending_requests": seller.pending_requests,
        "is_blocked": seller.is_blocked,
        "delivery_type": seller.delivery_type,
        "placement_expired_at": seller.placement_expired_at.isoformat() if seller.placement_expired_at else None,
        "deleted_at": seller.deleted_at.isoformat() if seller.deleted_at else None,
        "is_deleted": seller.deleted_at is not None
    }


@router.put("/{tg_id}/limits")
async def update_seller_limits(tg_id: int, max_orders: int, session: AsyncSession = Depends(get_session)):
    """Обновить лимит заказов продавца"""
    if max_orders < 1 or max_orders > 100:
        from fastapi import HTTPException
        raise HTTPException(400, "Лимит должен быть от 1 до 100")
    
    result = await session.execute(
        select(Seller).where(Seller.seller_id == tg_id)
    )
    seller = result.scalar_one_or_none()
    
    if not seller:
        from fastapi import HTTPException
        raise HTTPException(404, "Продавец не найден")
    
    seller.max_orders = max_orders
    await session.commit()
    
    return {"status": "ok", "max_orders": max_orders}