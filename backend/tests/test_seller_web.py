"""
Tests for Seller Web Panel API endpoints and Seller Authentication.

Tests cover:
- Seller login (JWT auth)
- Seller token validation (require_seller_token dependency)
- Seller profile (/me) and update
- Orders via web panel (list, accept, reject, status update, price update)
- Products CRUD via web panel
- Stats and CSV export
- Dashboard alerts
- Limits update
- Security: change credentials
"""
import os
import pytest
import jwt
from datetime import datetime, timedelta
from httpx import AsyncClient

from sqlalchemy import select, func
from backend.app.models.user import User
from backend.app.models.seller import Seller
from backend.app.models.product import Product
from backend.app.models.order import Order
from backend.app.models.cart import CartItem, BuyerFavoriteProduct
from backend.app.core.password_utils import hash_password

# JWT_SECRET matches the one used in seller_auth.py
JWT_SECRET = os.getenv("JWT_SECRET") or os.getenv("ADMIN_SECRET", "test_admin_secret")
JWT_ALGORITHM = "HS256"


def create_seller_jwt(seller_id: int) -> str:
    """Create a valid seller JWT token for tests."""
    payload = {
        "sub": str(seller_id),
        "role": "seller",
        "exp": datetime.utcnow() + timedelta(hours=24),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def seller_headers(seller_id: int) -> dict:
    """Get seller auth headers."""
    token = create_seller_jwt(seller_id)
    return {"X-Seller-Token": token}


# ============================================
# SELLER AUTH (seller_auth.py)
# ============================================

@pytest.mark.asyncio
async def test_seller_login_success(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test successful seller login."""
    # Set up web credentials
    test_seller.web_login = f"Seller{test_seller.seller_id}"
    test_seller.web_password_hash = hash_password(str(test_seller.seller_id))
    await test_session.commit()

    response = await client.post("/seller-web/login", json={
        "login": f"Seller{test_seller.seller_id}",
        "password": str(test_seller.seller_id),
    })
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert data["seller_id"] == test_seller.seller_id
    assert data["role"] == "seller"


@pytest.mark.asyncio
async def test_seller_login_wrong_password(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test seller login with wrong password."""
    test_seller.web_login = f"Seller{test_seller.seller_id}"
    test_seller.web_password_hash = hash_password("correct_password")
    await test_session.commit()

    response = await client.post("/seller-web/login", json={
        "login": f"Seller{test_seller.seller_id}",
        "password": "wrong_password",
    })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_seller_login_wrong_login(client: AsyncClient):
    """Test seller login with non-existent login."""
    response = await client.post("/seller-web/login", json={
        "login": "nonexistent",
        "password": "password",
    })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_seller_login_blocked(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test seller login when seller is blocked."""
    test_seller.web_login = f"Seller{test_seller.seller_id}"
    test_seller.web_password_hash = hash_password("pass123")
    test_seller.is_blocked = True
    await test_session.commit()

    response = await client.post("/seller-web/login", json={
        "login": f"Seller{test_seller.seller_id}",
        "password": "pass123",
    })
    assert response.status_code == 403


# ============================================
# SELLER TOKEN VALIDATION
# ============================================

@pytest.mark.asyncio
async def test_seller_endpoint_no_token(client: AsyncClient):
    """Test seller web endpoint without token."""
    response = await client.get("/seller-web/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_seller_endpoint_invalid_token(client: AsyncClient):
    """Test seller web endpoint with invalid token."""
    response = await client.get(
        "/seller-web/me",
        headers={"X-Seller-Token": "invalid_token"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_seller_endpoint_expired_token(client: AsyncClient, test_seller: Seller):
    """Test seller web endpoint with expired token."""
    payload = {
        "sub": str(test_seller.seller_id),
        "role": "seller",
        "exp": datetime.utcnow() - timedelta(hours=1),  # Expired
        "iat": datetime.utcnow() - timedelta(hours=2),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    response = await client.get(
        "/seller-web/me",
        headers={"X-Seller-Token": token},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_seller_endpoint_deleted_seller(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test seller web endpoint for soft-deleted seller."""
    test_seller.deleted_at = datetime.utcnow()
    await test_session.commit()

    response = await client.get(
        "/seller-web/me",
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_seller_endpoint_blocked_seller(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test seller web endpoint for blocked seller."""
    test_seller.is_blocked = True
    await test_session.commit()

    response = await client.get(
        "/seller-web/me",
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 403


# ============================================
# SELLER PROFILE (/me)
# ============================================

@pytest.mark.asyncio
async def test_get_seller_me(client: AsyncClient, test_seller: Seller):
    """Test getting seller profile via /me."""
    response = await client.get(
        "/seller-web/me",
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("seller_id") == test_seller.seller_id or data.get("shop_name") is not None


@pytest.mark.asyncio
async def test_update_seller_me(client: AsyncClient, test_seller: Seller):
    """Test updating seller profile."""
    response = await client.put(
        "/seller-web/me",
        json={
            "shop_name": "Updated Shop Name",
            "description": "New description",
            "hashtags": "розы, тюльпаны",
        },
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("shop_name") == "Updated Shop Name"


@pytest.mark.asyncio
async def test_update_seller_delivery(client: AsyncClient, test_seller: Seller):
    """Test updating seller delivery type."""
    response = await client.put(
        "/seller-web/me",
        json={
            "delivery_type": "доставка и самовывоз",
        },
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_update_seller_preorder_settings(client: AsyncClient, test_seller: Seller):
    """Test updating seller preorder schedule."""
    response = await client.put(
        "/seller-web/me",
        json={
            "preorder_enabled": True,
            "preorder_schedule_type": "weekly",
            "preorder_weekday": 1,
        },
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200


# ============================================
# SELLER ORDERS
# ============================================

@pytest.mark.asyncio
async def test_seller_get_orders(client: AsyncClient, test_seller: Seller, test_order: Order):
    """Test getting seller orders."""
    response = await client.get(
        "/seller-web/orders",
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_seller_get_orders_with_status(client: AsyncClient, test_seller: Seller, test_order: Order):
    """Test getting seller orders with status filter."""
    response = await client.get(
        "/seller-web/orders",
        params={"status": "pending"},
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    data = response.json()
    for order in data:
        assert order["status"] == "pending"


@pytest.mark.asyncio
async def test_seller_get_order_by_id(client: AsyncClient, test_seller: Seller, test_order: Order):
    """Test getting specific order."""
    response = await client.get(
        f"/seller-web/orders/{test_order.id}",
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_seller_get_order_not_found(client: AsyncClient, test_seller: Seller):
    """Test getting non-existent order."""
    response = await client.get(
        "/seller-web/orders/999999",
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_seller_accept_order(client: AsyncClient, test_seller: Seller, test_order: Order):
    """Test accepting order via web panel."""
    response = await client.post(
        f"/seller-web/orders/{test_order.id}/accept",
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["new_status"] == "accepted"


@pytest.mark.asyncio
async def test_seller_reject_order(client: AsyncClient, test_seller: Seller, test_order: Order):
    """Test rejecting order via web panel."""
    response = await client.post(
        f"/seller-web/orders/{test_order.id}/reject",
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["new_status"] == "rejected"


@pytest.mark.asyncio
async def test_seller_update_order_status(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
    test_order: Order,
):
    """Test updating order status via web panel."""
    test_order.status = "accepted"
    await test_session.commit()

    response = await client.put(
        f"/seller-web/orders/{test_order.id}/status",
        params={"status": "assembling"},
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["new_status"] == "assembling"


@pytest.mark.asyncio
async def test_seller_update_order_price(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
    test_order: Order,
):
    """Test updating order price via web panel."""
    test_order.status = "accepted"
    await test_session.commit()

    response = await client.put(
        f"/seller-web/orders/{test_order.id}/price",
        params={"new_price": 250.0},
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    data = response.json()
    assert float(data.get("total_price", 0)) == 250.0


# ============================================
# SELLER PRODUCTS (via web panel)
# ============================================

@pytest.mark.asyncio
async def test_seller_get_products(client: AsyncClient, test_seller: Seller, test_product: Product):
    """Test getting seller products."""
    response = await client.get(
        "/seller-web/products",
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_seller_add_product(client: AsyncClient, test_seller: Seller):
    """Test adding a product via web panel."""
    response = await client.post(
        "/seller-web/products",
        json={
            "seller_id": test_seller.seller_id,
            "name": "New Product",
            "description": "Product description",
            "price": 199.99,
            "quantity": 10,
        },
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_seller_add_product_wrong_seller(client: AsyncClient, test_seller: Seller):
    """Test adding product for different seller (forbidden)."""
    response = await client.post(
        "/seller-web/products",
        json={
            "seller_id": 999999999,  # Different seller
            "name": "Bad Product",
            "description": "Should fail",
            "price": 100.0,
        },
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_seller_update_product(client: AsyncClient, test_seller: Seller, test_product: Product):
    """Test updating product via web panel."""
    response = await client.put(
        f"/seller-web/products/{test_product.id}",
        json={"name": "Updated Product Name", "price": 299.99},
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_seller_delete_product(client: AsyncClient, test_seller: Seller, test_product: Product):
    """Test deleting product via web panel."""
    response = await client.delete(
        f"/seller-web/products/{test_product.id}",
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "deleted"


@pytest.mark.asyncio
async def test_seller_delete_product_not_found(client: AsyncClient, test_seller: Seller):
    """Test deleting non-existent product."""
    response = await client.delete(
        "/seller-web/products/999999",
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_seller_delete_product_with_cart_and_favorites(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
    test_product: Product,
    test_user: User,
):
    """Test deleting product that is in cart and favorites: should succeed and remove related rows."""
    # Add product to cart and favorites for a buyer
    test_session.add(
        CartItem(
            buyer_id=test_user.tg_id,
            seller_id=test_seller.seller_id,
            product_id=test_product.id,
            quantity=1,
            name=test_product.name,
            price=test_product.price,
        )
    )
    test_session.add(
        BuyerFavoriteProduct(buyer_id=test_user.tg_id, product_id=test_product.id)
    )
    await test_session.commit()
    product_id = test_product.id

    response = await client.delete(
        f"/seller-web/products/{product_id}",
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    assert response.json()["status"] == "deleted"

    # Verify product and related rows are gone (API uses same test_session, so commit already applied)
    cart_count = (await test_session.execute(select(func.count()).select_from(CartItem).where(CartItem.product_id == product_id))).scalar()
    fav_count = (await test_session.execute(select(func.count()).select_from(BuyerFavoriteProduct).where(BuyerFavoriteProduct.product_id == product_id))).scalar()
    product_exists = (await test_session.execute(select(Product).where(Product.id == product_id))).scalar_one_or_none() is not None
    assert cart_count == 0, "cart_items should have no rows for deleted product"
    assert fav_count == 0, "buyer_favorite_products should have no rows for deleted product"
    assert not product_exists, "product should be deleted"


# ============================================
# SELLER STATS
# ============================================

@pytest.mark.asyncio
async def test_seller_get_stats(client: AsyncClient, test_seller: Seller):
    """Test getting seller stats."""
    response = await client.get(
        "/seller-web/stats",
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_seller_get_stats_with_period(client: AsyncClient, test_seller: Seller):
    """Test getting seller stats with predefined period."""
    response = await client.get(
        "/seller-web/stats",
        params={"period": "7d"},
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("filters", {}).get("period") == "7d"


@pytest.mark.asyncio
async def test_seller_get_stats_with_dates(client: AsyncClient, test_seller: Seller):
    """Test getting seller stats with date range."""
    response = await client.get(
        "/seller-web/stats",
        params={"date_from": "2025-01-01", "date_to": "2025-12-31"},
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_seller_export_stats_csv(client: AsyncClient, test_seller: Seller):
    """Test exporting seller stats as CSV."""
    response = await client.get(
        "/seller-web/stats/export",
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    assert "text/csv" in response.headers.get("content-type", "")


# ============================================
# DASHBOARD ALERTS
# ============================================

@pytest.mark.asyncio
async def test_seller_dashboard_alerts(client: AsyncClient, test_seller: Seller):
    """Test getting dashboard alerts."""
    response = await client.get(
        "/seller-web/dashboard/alerts",
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    data = response.json()
    assert "low_stock_bouquets" in data
    assert "expiring_items" in data


# ============================================
# LIMITS
# ============================================

@pytest.mark.asyncio
async def test_seller_update_limits(client: AsyncClient, test_seller: Seller):
    """Test updating seller order limits."""
    response = await client.put(
        "/seller-web/limits",
        params={"max_orders": 15},
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
