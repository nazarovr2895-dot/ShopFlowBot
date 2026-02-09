# Файл: backend/app/services/products.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import Optional
from backend.app.models.product import Product
from backend.app.schemas import MAX_PRODUCT_PHOTOS


def _normalize_photo_ids(data: dict) -> dict:
    """Set photo_ids (max 3) and photo_id (first) from data."""
    data = dict(data)
    photo_ids = data.get("photo_ids")
    if photo_ids is not None:
        if not isinstance(photo_ids, list):
            photo_ids = list(photo_ids) if photo_ids else []
        photo_ids = [str(p).strip() for p in photo_ids if p][:MAX_PRODUCT_PHOTOS]
    else:
        photo_id = data.get("photo_id")
        photo_ids = [photo_id] if photo_id else []
    data["photo_ids"] = photo_ids
    data["photo_id"] = photo_ids[0] if photo_ids else None
    return data


async def create_product_service(session: AsyncSession, data: dict):
    data = _normalize_photo_ids(data)
    new_product = Product(**data)
    session.add(new_product)
    await session.commit()
    return new_product

async def get_products_by_seller_service(
    session: AsyncSession,
    seller_id: int,
    only_available: bool = False,
    preorder: Optional[bool] = None,
):
    """
    Получить товары продавца.

    Args:
        session: Сессия БД
        seller_id: ID продавца
        only_available: Если True, возвращает только товары с quantity > 0
        preorder: Если True — только предзаказные, если False — только обычные, если None — все
    """
    query = select(Product).where(Product.seller_id == seller_id)
    if only_available:
        query = query.where(Product.quantity > 0)
    if preorder is not None:
        query = query.where(Product.is_preorder == preorder)
    result = await session.execute(query)
    return result.scalars().all()

async def get_product_by_id_service(session: AsyncSession, product_id: int):
    """Получить товар по ID"""
    result = await session.execute(select(Product).where(Product.id == product_id))
    return result.scalar_one_or_none()

async def update_product_service(session: AsyncSession, product_id: int, update_data: dict):
    """Обновить товар"""
    result = await session.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    
    if not product:
        return None
    
    if "photo_ids" in update_data or "photo_id" in update_data:
        update_data = _normalize_photo_ids({**{k: getattr(product, k) for k in ("photo_id", "photo_ids")}, **update_data})
    for field, value in update_data.items():
        if value is not None:
            setattr(product, field, value)
    
    await session.commit()
    await session.refresh(product)
    return product

async def delete_product_service(session: AsyncSession, product_id: int):
    await session.execute(delete(Product).where(Product.id == product_id))
    await session.commit()
    return True