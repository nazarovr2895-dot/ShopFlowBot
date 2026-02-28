"""
Tests for Public API endpoints.

Tests cover:
- Public seller listing with filters
- Public seller detail
- Cities, districts, and metro endpoints
- Caching behavior
"""
import pytest
from httpx import AsyncClient
from datetime import datetime, timedelta

from backend.app.models.user import User
from backend.app.models.seller import Seller, City, District, Metro
from backend.app.models.product import Product


@pytest.mark.asyncio
async def test_get_public_sellers(
    client: AsyncClient,
    test_seller: Seller,
    test_product: Product,
):
    """Test getting public seller list."""
    response = await client.get("/public/sellers")
    
    assert response.status_code == 200
    data = response.json()
    assert "sellers" in data
    assert "total" in data
    assert "page" in data
    assert "per_page" in data


@pytest.mark.asyncio
async def test_get_public_sellers_filters_city(
    client: AsyncClient,
    test_seller: Seller,
    test_city: City,
):
    """Test filtering sellers by city."""
    response = await client.get(
        "/public/sellers",
        params={"city_id": test_city.id}
    )
    
    assert response.status_code == 200
    data = response.json()
    # All returned sellers should be in the specified city
    for seller in data["sellers"]:
        assert seller["city_name"] == test_city.name


@pytest.mark.asyncio
async def test_get_public_sellers_filters_district(
    client: AsyncClient,
    test_seller: Seller,
    test_district: District,
):
    """Test filtering sellers by district."""
    response = await client.get(
        "/public/sellers",
        params={"district_id": test_district.id}
    )
    
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_public_sellers_filters_delivery_type(
    client: AsyncClient,
    test_seller: Seller,
):
    """Test filtering sellers by delivery type."""
    response = await client.get(
        "/public/sellers",
        params={"delivery_type": "pickup"}
    )
    
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_public_sellers_pagination(
    client: AsyncClient,
    test_seller: Seller,
):
    """Test seller list pagination."""
    response = await client.get(
        "/public/sellers",
        params={"page": 1, "per_page": 5}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["page"] == 1
    assert data["per_page"] == 5
    assert len(data["sellers"]) <= 5


@pytest.mark.asyncio
async def test_get_public_sellers_sort_price_asc(
    client: AsyncClient,
    test_seller: Seller,
):
    """Test sorting sellers by price ascending."""
    response = await client.get(
        "/public/sellers",
        params={"sort_price": "asc"}
    )
    
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_public_sellers_sort_price_desc(
    client: AsyncClient,
    test_seller: Seller,
):
    """Test sorting sellers by price descending."""
    response = await client.get(
        "/public/sellers",
        params={"sort_price": "desc"}
    )
    
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_public_sellers_excludes_blocked(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test that blocked sellers are excluded from public list."""
    # Block the seller
    test_seller.is_blocked = True
    await test_session.commit()
    
    response = await client.get("/public/sellers")
    
    assert response.status_code == 200
    data = response.json()
    # Blocked seller should not appear
    seller_ids = [s["seller_id"] for s in data["sellers"]]
    assert test_seller.seller_id not in seller_ids


@pytest.mark.asyncio
async def test_get_public_sellers_excludes_deleted(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test that soft-deleted sellers are excluded from public list."""
    # Soft delete the seller
    test_seller.deleted_at = datetime.utcnow()
    await test_session.commit()
    
    response = await client.get("/public/sellers")
    
    assert response.status_code == 200
    data = response.json()
    # Deleted seller should not appear
    seller_ids = [s["seller_id"] for s in data["sellers"]]
    assert test_seller.seller_id not in seller_ids


@pytest.mark.asyncio
async def test_get_public_sellers_excludes_expired_placement(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test that sellers with expired placement are excluded."""
    # Set expired placement
    test_seller.placement_expired_at = datetime.utcnow() - timedelta(days=1)
    await test_session.commit()
    
    response = await client.get("/public/sellers")
    
    assert response.status_code == 200
    data = response.json()
    # Expired seller should not appear
    seller_ids = [s["seller_id"] for s in data["sellers"]]
    assert test_seller.seller_id not in seller_ids


@pytest.mark.asyncio
async def test_get_public_sellers_excludes_full(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test that sellers at max capacity are excluded."""
    # Fill up seller's slots
    test_seller.max_orders = 5
    test_seller.active_orders = 3
    test_seller.pending_requests = 2
    await test_session.commit()
    
    response = await client.get("/public/sellers")
    
    assert response.status_code == 200
    data = response.json()
    # Full seller should not appear
    seller_ids = [s["seller_id"] for s in data["sellers"]]
    assert test_seller.seller_id not in seller_ids


# --- Seller Detail Tests ---

@pytest.mark.asyncio
async def test_get_public_seller_detail(
    client: AsyncClient,
    test_seller: Seller,
    test_product: Product,
):
    """Test getting public seller detail."""
    response = await client.get(f"/public/sellers/{test_seller.seller_id}")
    
    assert response.status_code == 200
    data = response.json()
    assert data["seller_id"] == test_seller.seller_id
    assert data["shop_name"] == test_seller.shop_name
    assert "products" in data
    assert "available_slots" in data


@pytest.mark.asyncio
async def test_get_public_seller_detail_not_found(client: AsyncClient):
    """Test getting non-existent seller detail."""
    response = await client.get("/public/sellers/999999999")
    
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_public_seller_detail_blocked(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test that blocked seller detail returns 403."""
    test_seller.is_blocked = True
    await test_session.commit()
    
    response = await client.get(f"/public/sellers/{test_seller.seller_id}")
    
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_get_public_seller_detail_deleted(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test that deleted seller detail returns 404."""
    test_seller.deleted_at = datetime.utcnow()
    await test_session.commit()
    
    response = await client.get(f"/public/sellers/{test_seller.seller_id}")
    
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_public_seller_detail_expired(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test that expired placement seller detail returns 403."""
    test_seller.placement_expired_at = datetime.utcnow() - timedelta(days=1)
    await test_session.commit()
    
    response = await client.get(f"/public/sellers/{test_seller.seller_id}")
    
    assert response.status_code == 403


# --- Reference Data Tests ---

@pytest.mark.asyncio
async def test_get_cities(
    client: AsyncClient,
    test_city: City,
):
    """Test getting cities list."""
    response = await client.get("/public/cities")
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert any(c["id"] == test_city.id for c in data)


@pytest.mark.asyncio
async def test_get_cities_cached(
    client: AsyncClient,
    mock_cache,
    test_city: City,
):
    """Test that cities are cached."""
    # First request - should hit DB
    response1 = await client.get("/public/cities")
    assert response1.status_code == 200
    
    # Second request - should hit cache
    response2 = await client.get("/public/cities")
    assert response2.status_code == 200
    
    # Both should return same data
    assert response1.json() == response2.json()


@pytest.mark.asyncio
async def test_get_districts(
    client: AsyncClient,
    test_city: City,
    test_district: District,
):
    """Test getting districts for a city."""
    response = await client.get(f"/public/districts/{test_city.id}")
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert any(d["id"] == test_district.id for d in data)
    # All districts should belong to the requested city
    for district in data:
        assert district["city_id"] == test_city.id


@pytest.mark.asyncio
async def test_get_districts_empty(
    client: AsyncClient,
):
    """Test getting districts for city with no districts."""
    response = await client.get("/public/districts/999999")
    
    assert response.status_code == 200
    data = response.json()
    assert data == []


@pytest.mark.asyncio
async def test_get_metro(
    client: AsyncClient,
    test_district: District,
    test_metro: Metro,
):
    """Test getting metro stations for a district."""
    response = await client.get(f"/public/metro/{test_district.id}")
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert any(m["id"] == test_metro.id for m in data)
    # All metro stations should belong to the requested district
    for metro in data:
        assert metro["district_id"] == test_district.id


@pytest.mark.asyncio
async def test_get_metro_empty(
    client: AsyncClient,
):
    """Test getting metro for district with no stations."""
    response = await client.get("/public/metro/999999")

    assert response.status_code == 200
    data = response.json()
    assert data == []


# --- Metro Search Tests ---

@pytest.mark.asyncio
async def test_metro_search_finds_station(
    client: AsyncClient,
    test_metro: Metro,
):
    """Test metro search finds existing station by partial name."""
    response = await client.get(
        "/public/metro/search",
        params={"q": "Арбат"},
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert any(m["name"] == "Арбатская" for m in data)


@pytest.mark.asyncio
async def test_metro_search_returns_empty_for_nonexistent(
    client: AsyncClient,
    test_metro: Metro,
):
    """Test metro search returns empty list for non-existent station."""
    response = await client.get(
        "/public/metro/search",
        params={"q": "НесуществующаяСтанция"},
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 0


@pytest.mark.asyncio
async def test_metro_search_partial_match(
    client: AsyncClient,
    test_metro: Metro,
):
    """Test metro search matches partial station name."""
    response = await client.get(
        "/public/metro/search",
        params={"q": "Арбат"},
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["name"] == "Арбатская"


@pytest.mark.asyncio
async def test_metro_search_returns_correct_fields(
    client: AsyncClient,
    test_metro: Metro,
):
    """Test metro search response has all required fields."""
    response = await client.get(
        "/public/metro/search",
        params={"q": "Арбат"},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    station = data[0]
    assert "id" in station
    assert "name" in station
    assert "district_id" in station
    assert "line_color" in station


@pytest.mark.asyncio
async def test_metro_search_requires_query(client: AsyncClient):
    """Test metro search requires q parameter."""
    response = await client.get("/public/metro/search")
    assert response.status_code == 422  # Missing required parameter


@pytest.mark.asyncio
async def test_metro_search_multiple_results(
    client: AsyncClient,
    test_session,
    test_district: District,
):
    """Test metro search returns multiple matching stations."""
    # Create several stations with similar names
    stations = [
        Metro(id=100, district_id=test_district.id, name="Парк Культуры", line_color="#d6001c"),
        Metro(id=101, district_id=test_district.id, name="Парк Победы", line_color="#0079c9"),
        Metro(id=102, district_id=test_district.id, name="Парк Горького", line_color="#009a49"),
    ]
    for s in stations:
        test_session.add(s)
    await test_session.commit()

    response = await client.get(
        "/public/metro/search",
        params={"q": "Парк"},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 3


# --- Multiple Sellers Tests ---

@pytest.mark.asyncio
async def test_multiple_sellers_listing(
    client: AsyncClient,
    test_session,
    test_city: City,
    test_district: District,
):
    """Test public listing with multiple sellers."""
    # Create multiple test sellers
    users = []
    sellers = []
    
    for i in range(5):
        user = User(
            tg_id=100000000 + i,
            username=f"seller{i}",
            fio=f"Seller {i}",
            role="SELLER",
        )
        test_session.add(user)
        users.append(user)
    
    await test_session.commit()
    
    for i, user in enumerate(users):
        seller = Seller(
            seller_id=user.tg_id,
            owner_id=user.tg_id,
            shop_name=f"Shop {i}",
            city_id=test_city.id,
            district_id=test_district.id,
            delivery_type="both",
            max_orders=10,
            active_orders=i,  # Different availability
            pending_requests=0,
            max_delivery_orders=10,
            max_pickup_orders=20,
            active_delivery_orders=0,
            active_pickup_orders=0,
            pending_delivery_requests=0,
            pending_pickup_requests=0,
            is_blocked=False,
            subscription_plan="active",
        )
        test_session.add(seller)
        sellers.append(seller)
        
        # Add product for each seller
        product = Product(
            seller_id=seller.seller_id,
            name=f"Product {i}",
            price=50.0 + i * 10,
            is_active=True,
        )
        test_session.add(product)
    
    await test_session.commit()
    
    response = await client.get("/public/sellers")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 5


# --- Seller Availability Endpoint Tests ---

@pytest.mark.asyncio
async def test_get_seller_availability(
    client: AsyncClient,
    test_seller: Seller,
):
    """Test getting per-type availability for a seller."""
    response = await client.get(f"/public/sellers/{test_seller.seller_id}/availability")

    assert response.status_code == 200
    data = response.json()
    assert "delivery_remaining" in data
    assert "pickup_remaining" in data
    assert "delivery_limit" in data
    assert "pickup_limit" in data
    assert data["delivery_limit"] == 10
    assert data["pickup_limit"] == 20
    assert data["delivery_remaining"] == 10
    assert data["pickup_remaining"] == 20


@pytest.mark.asyncio
async def test_get_seller_availability_partial_usage(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test availability with some slots used."""
    test_seller.active_delivery_orders = 3
    test_seller.pending_delivery_requests = 2
    test_seller.active_pickup_orders = 5
    test_seller.pending_pickup_requests = 1
    await test_session.commit()

    response = await client.get(f"/public/sellers/{test_seller.seller_id}/availability")

    assert response.status_code == 200
    data = response.json()
    assert data["delivery_remaining"] == 5  # 10 - (3+2)
    assert data["pickup_remaining"] == 14  # 20 - (5+1)
    assert data["delivery_used"] == 5
    assert data["pickup_used"] == 6


@pytest.mark.asyncio
async def test_get_seller_availability_fully_booked(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test availability when delivery is fully booked but pickup still has slots."""
    test_seller.active_delivery_orders = 8
    test_seller.pending_delivery_requests = 2
    test_seller.active_pickup_orders = 3
    await test_session.commit()

    response = await client.get(f"/public/sellers/{test_seller.seller_id}/availability")

    assert response.status_code == 200
    data = response.json()
    assert data["delivery_remaining"] == 0  # 10 - (8+2)
    assert data["pickup_remaining"] == 17  # 20 - 3


@pytest.mark.asyncio
async def test_get_seller_availability_not_found(
    client: AsyncClient,
):
    """Test availability for non-existent seller returns zeros."""
    response = await client.get("/public/sellers/999999999/availability")

    assert response.status_code == 200
    data = response.json()
    assert data["delivery_remaining"] == 0
    assert data["pickup_remaining"] == 0


@pytest.mark.asyncio
async def test_public_seller_list_includes_per_type_slots(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test that public seller list includes per-type slot fields."""
    # Set default_daily_limit so the seller passes the effective_limit_expr > 0 filter
    test_seller.default_daily_limit = 30
    test_seller.active_delivery_orders = 2
    test_seller.active_pickup_orders = 3
    await test_session.commit()

    # Add product with quantity > 0 (required for public list INNER JOIN on product_stats)
    product = Product(
        seller_id=test_seller.seller_id,
        name="Test Slot Product",
        price=100.0,
        is_active=True,
        quantity=5,
    )
    test_session.add(product)
    await test_session.commit()

    response = await client.get("/public/sellers")

    assert response.status_code == 200
    data = response.json()
    assert len(data["sellers"]) >= 1
    seller = next((s for s in data["sellers"] if s["seller_id"] == test_seller.seller_id), None)
    assert seller is not None
    assert "delivery_slots" in seller
    assert "pickup_slots" in seller


@pytest.mark.asyncio
async def test_public_seller_detail_includes_per_type_slots(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
    test_metro: Metro,
):
    """Test that per-type slot fields work correctly via availability endpoint."""
    test_seller.active_delivery_orders = 4
    test_seller.pending_delivery_requests = 1
    await test_session.commit()

    response = await client.get(f"/public/sellers/{test_seller.seller_id}/availability")

    assert response.status_code == 200
    data = response.json()
    assert "delivery_remaining" in data
    assert "pickup_remaining" in data
    assert data["delivery_remaining"] == 5  # 10 - (4+1)
    assert data["pickup_remaining"] == 20
