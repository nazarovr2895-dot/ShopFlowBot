"""
Tests for Sellers API endpoints.

Tests cover:
- Getting seller info
- Products CRUD operations
- Seller limits management
"""
import pytest
from httpx import AsyncClient

from backend.app.models.user import User
from backend.app.models.seller import Seller
from backend.app.models.product import Product


@pytest.mark.asyncio
async def test_get_seller_info(
    client: AsyncClient,
    test_seller: Seller,
):
    """Test getting seller information."""
    response = await client.get(f"/sellers/{test_seller.seller_id}")
    
    assert response.status_code == 200
    data = response.json()
    assert data["seller_id"] == test_seller.seller_id
    assert data["shop_name"] == test_seller.shop_name


@pytest.mark.asyncio
async def test_get_seller_info_not_found(client: AsyncClient):
    """Test getting non-existent seller."""
    response = await client.get("/sellers/999999999")
    
    assert response.status_code == 200
    assert response.json() is None


@pytest.mark.asyncio
async def test_update_seller_limits(
    client: AsyncClient,
    test_seller: Seller,
):
    """Test updating seller order limits."""
    new_max_orders = 8  # within free plan cap (10)

    response = await client.put(
        f"/sellers/{test_seller.seller_id}/limits",
        params={"max_orders": new_max_orders}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["max_orders"] == new_max_orders


@pytest.mark.asyncio
async def test_update_seller_limits_not_found(client: AsyncClient):
    """Test updating limits for non-existent seller."""
    response = await client.put(
        "/sellers/999999999/limits",
        params={"max_orders": 10}
    )
    
    assert response.status_code == 404


# --- Product Tests ---

@pytest.mark.asyncio
async def test_add_product(
    client: AsyncClient,
    test_seller: Seller,
):
    """Test adding a new product."""
    product_data = {
        "seller_id": test_seller.seller_id,
        "name": "New Product",
        "description": "A brand new product",
        "price": 150.50,
    }
    
    response = await client.post("/sellers/products/add", json=product_data)
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] > 0
    assert data["name"] == "New Product"
    assert data["price"] == 150.50
    assert data["seller_id"] == test_seller.seller_id


@pytest.mark.asyncio
async def test_add_product_with_photo(
    client: AsyncClient,
    test_seller: Seller,
):
    """Test adding a product with photo ID."""
    product_data = {
        "seller_id": test_seller.seller_id,
        "name": "Product with Photo",
        "description": "Has a photo",
        "price": 99.99,
        "photo_id": "AgACAgIAAxkBAAIBZ2abc123",
    }
    
    response = await client.post("/sellers/products/add", json=product_data)
    
    assert response.status_code == 200
    data = response.json()
    assert data["photo_id"] == "AgACAgIAAxkBAAIBZ2abc123"


@pytest.mark.asyncio
async def test_get_products(
    client: AsyncClient,
    test_seller: Seller,
    test_product: Product,
):
    """Test getting products for a seller."""
    response = await client.get(f"/sellers/{test_seller.seller_id}/products")
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_get_products_empty(
    client: AsyncClient,
    test_seller_user: User,
    test_city,
    test_district,
    test_session,
):
    """Test getting products for seller with no products."""
    # Create seller without products
    seller = Seller(
        seller_id=test_seller_user.tg_id,
        owner_id=test_seller_user.tg_id,
        shop_name="Empty Shop",
        city_id=test_city.id,
        district_id=test_district.id,
        subscription_plan="active",
    )
    test_session.add(seller)
    await test_session.commit()
    
    response = await client.get(f"/sellers/{seller.seller_id}/products")
    
    assert response.status_code == 200
    data = response.json()
    assert data == []


@pytest.mark.asyncio
async def test_get_product_by_id(
    client: AsyncClient,
    test_product: Product,
):
    """Test getting a specific product by ID."""
    response = await client.get(f"/sellers/products/{test_product.id}")
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_product.id
    assert data["name"] == test_product.name


@pytest.mark.asyncio
async def test_get_product_not_found(client: AsyncClient):
    """Test getting non-existent product."""
    response = await client.get("/sellers/products/999999")
    
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_product(
    client: AsyncClient,
    test_product: Product,
):
    """Test updating product."""
    update_data = {
        "name": "Updated Product Name",
        "price": 199.99,
    }
    
    response = await client.put(
        f"/sellers/products/{test_product.id}",
        json=update_data
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Product Name"
    assert data["price"] == 199.99


@pytest.mark.asyncio
async def test_update_product_partial(
    client: AsyncClient,
    test_product: Product,
):
    """Test partial product update (only some fields)."""
    original_name = test_product.name
    update_data = {
        "description": "Updated description only",
    }
    
    response = await client.put(
        f"/sellers/products/{test_product.id}",
        json=update_data
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "Updated description only"
    # Name should remain unchanged
    assert data["name"] == original_name


@pytest.mark.asyncio
async def test_update_product_not_found(client: AsyncClient):
    """Test updating non-existent product."""
    update_data = {"name": "New Name"}
    
    response = await client.put("/sellers/products/999999", json=update_data)
    
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_product(
    client: AsyncClient,
    test_product: Product,
):
    """Test deleting a product."""
    response = await client.delete(f"/sellers/products/{test_product.id}")
    
    assert response.status_code == 200
    assert response.json()["status"] == "deleted"
    
    # Verify product is deleted
    get_response = await client.get(f"/sellers/products/{test_product.id}")
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_product_lifecycle(
    client: AsyncClient,
    test_seller: Seller,
):
    """Test complete product lifecycle: create -> update -> delete."""
    # 1. Create product
    product_data = {
        "seller_id": test_seller.seller_id,
        "name": "Lifecycle Product",
        "description": "Testing lifecycle",
        "price": 50.00,
    }
    
    create_response = await client.post("/sellers/products/add", json=product_data)
    assert create_response.status_code == 200
    product_id = create_response.json()["id"]
    
    # 2. Update product
    update_response = await client.put(
        f"/sellers/products/{product_id}",
        json={"price": 75.00}
    )
    assert update_response.status_code == 200
    assert update_response.json()["price"] == 75.00
    
    # 3. Delete product
    delete_response = await client.delete(f"/sellers/products/{product_id}")
    assert delete_response.status_code == 200


@pytest.mark.asyncio
async def test_seller_with_multiple_products(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test seller with multiple products."""
    # Add multiple products
    for i in range(5):
        product = Product(
            seller_id=test_seller.seller_id,
            name=f"Product {i}",
            description=f"Description {i}",
            price=100.00 + i * 10,
            is_active=True,
        )
        test_session.add(product)
    await test_session.commit()

    response = await client.get(f"/sellers/{test_seller.seller_id}/products")

    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 5


# --- Split Delivery Limits Tests ---

@pytest.mark.asyncio
async def test_get_seller_info_includes_split_limits(
    client: AsyncClient,
    test_seller: Seller,
):
    """Test that seller info includes per-type limit fields."""
    response = await client.get(f"/sellers/{test_seller.seller_id}")

    assert response.status_code == 200
    data = response.json()
    assert "max_delivery_orders" in data
    assert "max_pickup_orders" in data
    assert data["max_delivery_orders"] == 10
    assert data["max_pickup_orders"] == 20


@pytest.mark.asyncio
async def test_update_seller_split_limits(
    client: AsyncClient,
    test_seller: Seller,
):
    """Test updating seller per-type order limits."""
    response = await client.put(
        f"/sellers/{test_seller.seller_id}/limits",
        params={"max_delivery_orders": 5, "max_pickup_orders": 15}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["max_delivery_orders"] == 5
    assert data["max_pickup_orders"] == 15


@pytest.mark.asyncio
async def test_seller_split_limit_counters(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test that per-type counters are present and correct."""
    # Set some counter values
    test_seller.active_delivery_orders = 3
    test_seller.active_pickup_orders = 5
    test_seller.pending_delivery_requests = 1
    test_seller.pending_pickup_requests = 2
    await test_session.commit()

    response = await client.get(f"/sellers/{test_seller.seller_id}")

    assert response.status_code == 200
    data = response.json()
    assert data["active_delivery_orders"] == 3
    assert data["active_pickup_orders"] == 5
    assert data["pending_delivery_requests"] == 1
    assert data["pending_pickup_requests"] == 2
