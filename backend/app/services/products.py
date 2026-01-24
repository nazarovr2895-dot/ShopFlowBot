# Файл: backend/app/services/products.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from backend.app.models.product import Product

async def create_product_service(session: AsyncSession, data: dict):
    new_product = Product(**data)
    session.add(new_product)
    await session.commit()
    return new_product

async def get_products_by_seller_service(session: AsyncSession, seller_id: int):
    result = await session.execute(select(Product).where(Product.seller_id == seller_id))
    return result.scalars().all()

async def delete_product_service(session: AsyncSession, product_id: int):
    await session.execute(delete(Product).where(Product.id == product_id))
    await session.commit()
    return True