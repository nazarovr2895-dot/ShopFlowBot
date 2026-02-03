from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List

from backend.app.api.deps import get_session
from backend.app.core.logging import get_logger
from backend.app.models.product import Product
from backend.app.models.seller import Seller
from backend.app.schemas import ProductCreate, ProductUpdate, ProductResponse
from backend.app.services.sellers import (
    SellerService,
    SellerServiceError,
    SellerNotFoundError,
)
from backend.app.services.products import (
    create_product_service,
    get_products_by_seller_service,
    get_product_by_id_service,
    update_product_service,
    delete_product_service,
)
from backend.app.services.bouquets import list_bouquets_with_totals

router = APIRouter()
logger = get_logger(__name__)


def _handle_service_error(e: SellerServiceError):
    """Convert service exceptions to HTTP exceptions."""
    raise HTTPException(status_code=e.status_code, detail=e.message)


# --- ТОВАРЫ ---

@router.get("/{seller_id}/products", response_model=List[ProductResponse])
async def get_products(seller_id: int, session: AsyncSession = Depends(get_session)):
    """Получить все товары продавца (включая товары с количеством 0 для продавца)"""
    products = await get_products_by_seller_service(session, seller_id, only_available=False)
    return products if products else []


@router.get("/{seller_id}/bouquets")
async def get_seller_bouquets(seller_id: int, session: AsyncSession = Depends(get_session)):
    """Список букетов продавца (для бота при добавлении товара из букета)."""
    return await list_bouquets_with_totals(session, seller_id)


@router.post("/products/add", response_model=ProductResponse)
async def add_product(data: ProductCreate, session: AsyncSession = Depends(get_session)):
    """Добавить товар"""
    logger.info(
        "Adding product",
        seller_id=data.seller_id,
        product_name=data.name,
        price=float(data.price) if data.price else None,
    )
    product_data = {
        "seller_id": data.seller_id,
        "name": data.name,
        "description": data.description,
        "price": data.price,
        "photo_id": data.photo_id,
        "quantity": data.quantity
    }
    if data.bouquet_id is not None:
        product_data["bouquet_id"] = data.bouquet_id
    result = await create_product_service(session, product_data)
    logger.info("Product added", product_id=result.id, seller_id=data.seller_id)
    return result


@router.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(product_id: int, session: AsyncSession = Depends(get_session)):
    """Получить товар по ID"""
    product = await get_product_by_id_service(session, product_id)
    
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    
    return product


@router.put("/products/{product_id}", response_model=ProductResponse)
async def update_product(product_id: int, data: ProductUpdate, session: AsyncSession = Depends(get_session)):
    """Обновить товар"""
    update_data = data.model_dump(exclude_unset=True)
    product = await update_product_service(session, product_id, update_data)
    
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    
    return product


@router.delete("/products/{product_id}")
async def delete_product(product_id: int, session: AsyncSession = Depends(get_session)):
    """Удалить товар"""
    await delete_product_service(session, product_id)
    return {"status": "deleted"}


# --- ПРОДАВЦЫ ---

@router.get("/{tg_id}")
async def get_seller_info(tg_id: int, session: AsyncSession = Depends(get_session)):
    """Инфо о продавце (для проверки лимитов и т.д.)"""
    service = SellerService(session)
    seller_data = await service.get_seller(tg_id)
    
    if not seller_data:
        return None
    
    return seller_data


@router.put("/{tg_id}/limits")
async def update_seller_limits(tg_id: int, max_orders: int, session: AsyncSession = Depends(get_session)):
    """Обновить лимит заказов продавца"""
    service = SellerService(session)
    
    try:
        return await service.update_limits(tg_id, max_orders)
    except SellerServiceError as e:
        _handle_service_error(e)
