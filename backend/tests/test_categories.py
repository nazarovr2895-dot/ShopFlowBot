"""
Tests for Product Categories feature.

Tests cover:
- Category CRUD via seller web API (create, list, update, delete)
- Product assignment to categories
- Category in public API response
- Unsetting category (set to null)
"""
import os
import pytest
import jwt
from datetime import datetime, timedelta
from httpx import AsyncClient

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.user import User
from backend.app.models.seller import Seller
from backend.app.models.product import Product
from backend.app.models.category import Category

JWT_SECRET = os.getenv("JWT_SECRET") or os.getenv("ADMIN_SECRET", "test_admin_secret")
JWT_ALGORITHM = "HS256"


def create_seller_jwt(seller_id: int) -> str:
    payload = {
        "sub": str(seller_id),
        "role": "seller",
        "exp": datetime.utcnow() + timedelta(hours=24),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def seller_headers(seller_id: int) -> dict:
    token = create_seller_jwt(seller_id)
    return {"X-Seller-Token": token}


# ============================================
# CATEGORY CRUD
# ============================================

@pytest.mark.asyncio
async def test_create_category(
    client: AsyncClient,
    test_seller: Seller,
):
    """Test creating a new category."""
    headers = seller_headers(test_seller.seller_id)
    response = await client.post(
        "/seller-web/categories",
        json={"name": "Монобукеты", "sort_order": 0},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Монобукеты"
    assert data["sort_order"] == 0
    assert data["is_active"] is True
    assert data["seller_id"] == test_seller.seller_id
    assert "id" in data


@pytest.mark.asyncio
async def test_list_categories(
    client: AsyncClient,
    test_seller: Seller,
    test_session: AsyncSession,
):
    """Test listing categories for a seller."""
    # Create categories directly
    for i, name in enumerate(["Авторские", "Композиции", "Подарки"]):
        cat = Category(seller_id=test_seller.seller_id, name=name, sort_order=i)
        test_session.add(cat)
    await test_session.commit()

    headers = seller_headers(test_seller.seller_id)
    response = await client.get("/seller-web/categories", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3
    assert data[0]["name"] == "Авторские"
    assert data[1]["name"] == "Композиции"
    assert data[2]["name"] == "Подарки"


@pytest.mark.asyncio
async def test_update_category(
    client: AsyncClient,
    test_seller: Seller,
    test_session: AsyncSession,
):
    """Test renaming and reordering a category."""
    cat = Category(seller_id=test_seller.seller_id, name="Old Name", sort_order=0)
    test_session.add(cat)
    await test_session.commit()
    await test_session.refresh(cat)

    headers = seller_headers(test_seller.seller_id)
    response = await client.put(
        f"/seller-web/categories/{cat.id}",
        json={"name": "New Name", "sort_order": 5},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "New Name"
    assert data["sort_order"] == 5


@pytest.mark.asyncio
async def test_delete_category_unlinks_products(
    client: AsyncClient,
    test_seller: Seller,
    test_session: AsyncSession,
):
    """Test deleting a category sets product.category_id to None."""
    cat = Category(seller_id=test_seller.seller_id, name="To Delete", sort_order=0)
    test_session.add(cat)
    await test_session.commit()
    await test_session.refresh(cat)

    product = Product(
        seller_id=test_seller.seller_id,
        name="Product in Category",
        description="test",
        price=500,
        quantity=1,
        is_active=True,
        category_id=cat.id,
    )
    test_session.add(product)
    await test_session.commit()
    await test_session.refresh(product)
    assert product.category_id == cat.id

    headers = seller_headers(test_seller.seller_id)
    response = await client.delete(
        f"/seller-web/categories/{cat.id}",
        headers=headers,
    )
    assert response.status_code == 200

    # Verify product category_id is now None
    result = await test_session.execute(
        select(Product).where(Product.id == product.id)
    )
    updated_product = result.scalar_one_or_none()
    # Refresh from DB (may be stale due to separate sessions)
    if updated_product:
        await test_session.refresh(updated_product)
        assert updated_product.category_id is None


@pytest.mark.asyncio
async def test_delete_category_not_found(
    client: AsyncClient,
    test_seller: Seller,
):
    """Test deleting a non-existent category returns 404."""
    headers = seller_headers(test_seller.seller_id)
    response = await client.delete(
        "/seller-web/categories/99999",
        headers=headers,
    )
    assert response.status_code == 404


# ============================================
# PRODUCT WITH CATEGORY
# ============================================

@pytest.mark.asyncio
async def test_create_product_with_category(
    client: AsyncClient,
    test_seller: Seller,
    test_session: AsyncSession,
):
    """Test creating a product with category_id."""
    cat = Category(seller_id=test_seller.seller_id, name="Roses", sort_order=0)
    test_session.add(cat)
    await test_session.commit()
    await test_session.refresh(cat)

    headers = seller_headers(test_seller.seller_id)
    response = await client.post(
        "/seller-web/products",
        json={
            "seller_id": test_seller.seller_id,
            "name": "Red Roses",
            "description": "Beautiful roses",
            "price": 1500,
            "quantity": 10,
            "category_id": cat.id,
        },
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["category_id"] == cat.id


@pytest.mark.asyncio
async def test_update_product_category(
    client: AsyncClient,
    test_seller: Seller,
    test_session: AsyncSession,
):
    """Test changing a product's category and unsetting it."""
    cat1 = Category(seller_id=test_seller.seller_id, name="Cat1", sort_order=0)
    cat2 = Category(seller_id=test_seller.seller_id, name="Cat2", sort_order=1)
    test_session.add_all([cat1, cat2])
    await test_session.commit()
    await test_session.refresh(cat1)
    await test_session.refresh(cat2)

    product = Product(
        seller_id=test_seller.seller_id,
        name="Test Product",
        description="test",
        price=100,
        quantity=5,
        is_active=True,
        category_id=cat1.id,
    )
    test_session.add(product)
    await test_session.commit()
    await test_session.refresh(product)

    headers = seller_headers(test_seller.seller_id)

    # Update to cat2
    response = await client.put(
        f"/seller-web/products/{product.id}",
        json={"category_id": cat2.id},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["category_id"] == cat2.id

    # Unset category (null)
    response = await client.put(
        f"/seller-web/products/{product.id}",
        json={"category_id": None},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json().get("category_id") is None


# ============================================
# PUBLIC API
# ============================================

@pytest.mark.asyncio
async def test_public_seller_includes_categories(
    client: AsyncClient,
    test_seller: Seller,
    test_session: AsyncSession,
):
    """Test that public seller detail includes categories and product category_id."""
    cat = Category(seller_id=test_seller.seller_id, name="Букеты", sort_order=0)
    test_session.add(cat)
    await test_session.commit()
    await test_session.refresh(cat)

    product = Product(
        seller_id=test_seller.seller_id,
        name="Public Product",
        description="test",
        price=200,
        quantity=5,
        is_active=True,
        category_id=cat.id,
    )
    test_session.add(product)
    await test_session.commit()

    response = await client.get(f"/public/sellers/{test_seller.seller_id}")
    assert response.status_code == 200
    data = response.json()

    # Check categories in response
    assert "categories" in data
    assert len(data["categories"]) == 1
    assert data["categories"][0]["name"] == "Букеты"

    # Check product has category_id
    assert len(data["products"]) >= 1
    product_data = next(p for p in data["products"] if p["name"] == "Public Product")
    assert product_data["category_id"] == cat.id


@pytest.mark.asyncio
async def test_products_list_includes_category_id(
    client: AsyncClient,
    test_seller: Seller,
    test_session: AsyncSession,
):
    """Test that seller-web products list includes category_id."""
    cat = Category(seller_id=test_seller.seller_id, name="Gifts", sort_order=0)
    test_session.add(cat)
    await test_session.commit()
    await test_session.refresh(cat)

    product = Product(
        seller_id=test_seller.seller_id,
        name="Gift Box",
        description="test",
        price=300,
        quantity=3,
        is_active=True,
        category_id=cat.id,
    )
    test_session.add(product)
    await test_session.commit()

    headers = seller_headers(test_seller.seller_id)
    response = await client.get("/seller-web/products", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    gift = next(p for p in data if p["name"] == "Gift Box")
    assert gift["category_id"] == cat.id
