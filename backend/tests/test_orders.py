"""
Tests for Orders API endpoints.

Tests cover:
- Creating orders
- Accepting/rejecting orders
- Completing orders
- Status updates
- Order retrieval (seller/buyer)
- Order statistics
"""
import pytest
from httpx import AsyncClient
from decimal import Decimal

from backend.app.models.user import User
from backend.app.models.seller import Seller
from backend.app.models.order import Order
from backend.tests.conftest import get_auth_header_for_user


@pytest.mark.asyncio
async def test_create_order_success(
    client: AsyncClient,
    test_user: User,
    test_seller: Seller,
):
    """Test successful order creation."""
    order_data = {
        "buyer_id": test_user.tg_id,
        "seller_id": test_seller.seller_id,
        "items_info": "Test item x2",
        "total_price": "150.00",
        "delivery_type": "pickup",
    }
    
    response = await client.post("/orders/create", json=order_data)
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] > 0
    assert data["status"] == "pending"


@pytest.mark.asyncio
async def test_create_order_with_address(
    client: AsyncClient,
    test_user: User,
    test_seller: Seller,
):
    """Test order creation with delivery address."""
    order_data = {
        "buyer_id": test_user.tg_id,
        "seller_id": test_seller.seller_id,
        "items_info": "Test item",
        "total_price": "100.00",
        "delivery_type": "delivery",
        "address": "123 Test Street, Apt 45",
    }
    
    response = await client.post("/orders/create", json=order_data)
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "pending"


@pytest.mark.asyncio
async def test_create_order_seller_not_found(
    client: AsyncClient,
    test_user: User,
):
    """Test order creation with non-existent seller."""
    order_data = {
        "buyer_id": test_user.tg_id,
        "seller_id": 999999999,
        "items_info": "Test item",
        "total_price": "100.00",
        "delivery_type": "pickup",
    }
    
    response = await client.post("/orders/create", json=order_data)
    
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_order_seller_blocked(
    client: AsyncClient,
    test_session,
    test_user: User,
    test_seller: Seller,
):
    """Test order creation for blocked seller."""
    # Block the seller
    test_seller.is_blocked = True
    await test_session.commit()
    
    order_data = {
        "buyer_id": test_user.tg_id,
        "seller_id": test_seller.seller_id,
        "items_info": "Test item",
        "total_price": "100.00",
        "delivery_type": "pickup",
    }
    
    response = await client.post("/orders/create", json=order_data)
    
    assert response.status_code == 403
    assert "blocked" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_order_seller_limit_reached(
    client: AsyncClient,
    test_session,
    test_user: User,
    test_seller: Seller,
):
    """Test order creation when seller has reached limit."""
    # Set seller at limit
    test_seller.max_orders = 5
    test_seller.active_orders = 3
    test_seller.pending_requests = 2
    await test_session.commit()
    
    order_data = {
        "buyer_id": test_user.tg_id,
        "seller_id": test_seller.seller_id,
        "items_info": "Test item",
        "total_price": "100.00",
        "delivery_type": "pickup",
    }
    
    response = await client.post("/orders/create", json=order_data)
    
    assert response.status_code == 409
    assert "limit" in response.json()["detail"].lower() or "busy" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_order_with_auth_validation(
    client: AsyncClient,
    test_user: User,
    test_seller: Seller,
):
    """Test that authenticated user can only create orders for themselves."""
    # User 123456789 trying to create order for different buyer
    order_data = {
        "buyer_id": 111111111,  # Different from test_user.tg_id
        "seller_id": test_seller.seller_id,
        "items_info": "Test item",
        "total_price": "100.00",
        "delivery_type": "pickup",
    }
    
    # With auth header for test_user
    headers = get_auth_header_for_user(test_user.tg_id)
    response = await client.post("/orders/create", json=order_data, headers=headers)
    
    # Should fail because buyer_id doesn't match authenticated user
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_accept_order(
    client: AsyncClient,
    test_order: Order,
):
    """Test accepting a pending order."""
    response = await client.post(f"/orders/{test_order.id}/accept")
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["new_status"] == "accepted"
    assert data["buyer_id"] == test_order.buyer_id


@pytest.mark.asyncio
async def test_accept_order_not_found(client: AsyncClient):
    """Test accepting non-existent order."""
    response = await client.post("/orders/999999/accept")
    
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_accept_order_wrong_status(
    client: AsyncClient,
    test_session,
    test_order: Order,
):
    """Test accepting already accepted order."""
    test_order.status = "accepted"
    await test_session.commit()
    
    response = await client.post(f"/orders/{test_order.id}/accept")
    
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_reject_order(
    client: AsyncClient,
    test_order: Order,
):
    """Test rejecting a pending order."""
    response = await client.post(f"/orders/{test_order.id}/reject")
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["new_status"] == "rejected"


@pytest.mark.asyncio
async def test_reject_order_not_found(client: AsyncClient):
    """Test rejecting non-existent order."""
    response = await client.post("/orders/999999/reject")
    
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_done_order(
    client: AsyncClient,
    test_session,
    test_order: Order,
):
    """Test marking accepted order as done."""
    # First accept the order
    test_order.status = "accepted"
    await test_session.commit()
    
    response = await client.post(f"/orders/{test_order.id}/done")
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["new_status"] == "done"


@pytest.mark.asyncio
async def test_done_order_wrong_status(
    client: AsyncClient,
    test_order: Order,
):
    """Test completing order with wrong status."""
    # Order is pending, not accepted
    response = await client.post(f"/orders/{test_order.id}/done")
    
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_update_order_status(
    client: AsyncClient,
    test_session,
    test_order: Order,
):
    """Test updating order status."""
    test_order.status = "accepted"
    await test_session.commit()
    
    response = await client.put(
        f"/orders/{test_order.id}/status",
        params={"status": "assembling"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["new_status"] == "assembling"


@pytest.mark.asyncio
async def test_update_order_status_invalid(
    client: AsyncClient,
    test_order: Order,
):
    """Test updating order to invalid status."""
    response = await client.put(
        f"/orders/{test_order.id}/status",
        params={"status": "invalid_status"}
    )
    
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_get_seller_orders(
    client: AsyncClient,
    test_order: Order,
    test_seller: Seller,
):
    """Test getting orders for a seller."""
    response = await client.get(f"/orders/seller/{test_seller.seller_id}")
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["seller_id"] == test_seller.seller_id


@pytest.mark.asyncio
async def test_get_seller_orders_with_status_filter(
    client: AsyncClient,
    test_order: Order,
    test_seller: Seller,
):
    """Test getting seller orders with status filter."""
    response = await client.get(
        f"/orders/seller/{test_seller.seller_id}",
        params={"status": "pending"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    for order in data:
        assert order["status"] == "pending"


@pytest.mark.asyncio
async def test_get_buyer_orders(
    client: AsyncClient,
    test_order: Order,
    test_user: User,
):
    """Test getting orders for a buyer."""
    response = await client.get(f"/orders/buyer/{test_user.tg_id}")
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["buyer_id"] == test_user.tg_id


@pytest.mark.asyncio
async def test_get_seller_order_stats(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
    test_user: User,
):
    """Test getting seller order statistics."""
    # Create some completed orders
    for i in range(3):
        order = Order(
            buyer_id=test_user.tg_id,
            seller_id=test_seller.seller_id,
            items_info=f"Order {i}",
            total_price=100.00,
            status="done",
            delivery_type="pickup",
        )
        test_session.add(order)
    await test_session.commit()
    
    response = await client.get(f"/orders/seller/{test_seller.seller_id}/stats")
    
    assert response.status_code == 200
    data = response.json()
    assert "total_completed_orders" in data
    assert "total_revenue" in data
    assert "commission_18" in data
    assert "net_revenue" in data
    assert data["total_completed_orders"] == 3
    assert data["total_revenue"] == 300.0


@pytest.mark.asyncio
async def test_order_lifecycle(
    client: AsyncClient,
    test_user: User,
    test_seller: Seller,
):
    """Test complete order lifecycle: create -> accept -> done."""
    # 1. Create order
    order_data = {
        "buyer_id": test_user.tg_id,
        "seller_id": test_seller.seller_id,
        "items_info": "Lifecycle test item",
        "total_price": "200.00",
        "delivery_type": "pickup",
    }
    
    create_response = await client.post("/orders/create", json=order_data)
    assert create_response.status_code == 200
    order_id = create_response.json()["id"]
    
    # 2. Accept order
    accept_response = await client.post(f"/orders/{order_id}/accept")
    assert accept_response.status_code == 200
    assert accept_response.json()["new_status"] == "accepted"
    
    # 3. Mark as done
    done_response = await client.post(f"/orders/{order_id}/done")
    assert done_response.status_code == 200
    assert done_response.json()["new_status"] == "done"
