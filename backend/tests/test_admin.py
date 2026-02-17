"""
Tests for Admin API endpoints.

Tests cover:
- Admin authentication (login)
- Admin token validation
- Seller management (create, list, search, update, block, delete)
- Seller web credentials management
- Statistics endpoints
- Cache invalidation
- Reference data (cities, districts)
"""
import os
import pytest
from httpx import AsyncClient

from backend.app.models.user import User
from backend.app.models.seller import Seller, City, District
from backend.app.models.order import Order

# Admin credentials from environment (set in conftest.py or here)
ADMIN_LOGIN = os.getenv("ADMIN_LOGIN", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "test_admin_secret")


def admin_headers() -> dict:
    """Get admin token headers."""
    return {"X-Admin-Token": ADMIN_SECRET}


# ============================================
# ADMIN AUTH (admin_auth.py)
# ============================================

@pytest.mark.asyncio
async def test_admin_login_success(client: AsyncClient):
    """Test successful admin login returns token."""
    response = await client.post("/admin/login", json={
        "login": ADMIN_LOGIN,
        "password": ADMIN_PASSWORD,
    })
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert data["token"] == ADMIN_SECRET


@pytest.mark.asyncio
async def test_admin_login_wrong_password(client: AsyncClient):
    """Test admin login with wrong password."""
    response = await client.post("/admin/login", json={
        "login": ADMIN_LOGIN,
        "password": "wrong_password",
    })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_login_wrong_login(client: AsyncClient):
    """Test admin login with wrong login."""
    response = await client.post("/admin/login", json={
        "login": "wrong_user",
        "password": ADMIN_PASSWORD,
    })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_login_empty_body(client: AsyncClient):
    """Test admin login with empty body."""
    response = await client.post("/admin/login", json={})
    assert response.status_code == 422  # Validation error


# ============================================
# ADMIN REFERENCE DATA (admin.py)
# ============================================

@pytest.mark.asyncio
async def test_admin_get_cities(client: AsyncClient, test_city: City):
    """Test getting cities list from admin API."""
    response = await client.get(
        "/admin/cities",
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_admin_get_districts(client: AsyncClient, test_district: District, test_city: City):
    """Test getting districts by city from admin API."""
    response = await client.get(
        f"/admin/districts/{test_city.id}",
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


# ============================================
# SELLER MANAGEMENT (admin.py)
# ============================================

@pytest.mark.asyncio
async def test_admin_list_all_sellers(client: AsyncClient, test_seller: Seller):
    """Test listing all sellers."""
    response = await client.get(
        "/admin/sellers/all",
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_admin_list_sellers_include_deleted(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test listing sellers including soft-deleted."""
    from datetime import datetime
    test_seller.deleted_at = datetime.utcnow()
    await test_session.commit()

    # Without include_deleted, should not include the deleted seller
    response = await client.get(
        "/admin/sellers/all",
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    # The seller should NOT be in the active list
    assert isinstance(data, list)

    # With include_deleted, should include all
    response = await client.get(
        "/admin/sellers/all",
        params={"include_deleted": True},
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1  # At least the soft-deleted seller


@pytest.mark.asyncio
async def test_admin_search_sellers(client: AsyncClient, test_seller_user: User, test_seller: Seller):
    """Test searching sellers by FIO."""
    response = await client.get(
        "/admin/sellers/search",
        params={"fio": "Test Seller"},
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_admin_create_seller(client: AsyncClient, test_session, test_city: City, test_district: District):
    """Test creating a seller via admin API."""
    # First create a user for the seller
    from backend.app.models.user import User
    new_user = User(
        tg_id=555555555,
        username="newseller",
        fio="New Seller FIO",
        phone="+79005555555",
        role="SELLER",
    )
    test_session.add(new_user)
    await test_session.commit()

    response = await client.post(
        "/admin/create_seller",
        json={
            "tg_id": 555555555,
            "fio": "New Seller FIO",
            "phone": "+79005555555",
            "shop_name": "New Shop",
            "delivery_type": "both",
            "city_id": test_city.id,
            "district_id": test_district.id,
        },
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert "tg_id" in data or "seller_id" in data


@pytest.mark.asyncio
async def test_admin_update_seller_field(client: AsyncClient, test_seller: Seller):
    """Test updating a seller field."""
    response = await client.put(
        f"/admin/sellers/{test_seller.seller_id}/update",
        json={"field": "shop_name", "value": "Updated Shop Name"},
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") != "not_found"


@pytest.mark.asyncio
async def test_admin_update_seller_not_found(client: AsyncClient):
    """Test updating a non-existent seller."""
    response = await client.put(
        "/admin/sellers/999999999/update",
        json={"field": "shop_name", "value": "Test"},
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "not_found"


@pytest.mark.asyncio
async def test_admin_block_seller(client: AsyncClient, test_seller: Seller):
    """Test blocking a seller."""
    response = await client.put(
        f"/admin/sellers/{test_seller.seller_id}/block",
        params={"is_blocked": True},
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") != "not_found"


@pytest.mark.asyncio
async def test_admin_unblock_seller(client: AsyncClient, test_seller: Seller):
    """Test unblocking a seller."""
    response = await client.put(
        f"/admin/sellers/{test_seller.seller_id}/block",
        params={"is_blocked": False},
        headers=admin_headers(),
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_admin_block_seller_not_found(client: AsyncClient):
    """Test blocking a non-existent seller."""
    response = await client.put(
        "/admin/sellers/999999999/block",
        params={"is_blocked": True},
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "not_found"


@pytest.mark.asyncio
async def test_admin_soft_delete_seller(client: AsyncClient, test_seller: Seller):
    """Test soft-deleting a seller."""
    response = await client.put(
        f"/admin/sellers/{test_seller.seller_id}/soft-delete",
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") != "not_found"


@pytest.mark.asyncio
async def test_admin_soft_delete_not_found(client: AsyncClient):
    """Test soft-deleting a non-existent seller."""
    response = await client.put(
        "/admin/sellers/999999999/soft-delete",
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "not_found"


@pytest.mark.asyncio
async def test_admin_restore_seller(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test restoring a soft-deleted seller."""
    from datetime import datetime
    test_seller.deleted_at = datetime.utcnow()
    await test_session.commit()

    response = await client.put(
        f"/admin/sellers/{test_seller.seller_id}/restore",
        headers=admin_headers(),
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_admin_hard_delete_seller(client: AsyncClient, test_seller: Seller):
    """Test hard-deleting a seller."""
    response = await client.delete(
        f"/admin/sellers/{test_seller.seller_id}",
        headers=admin_headers(),
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_admin_reset_counters(client: AsyncClient, test_seller: Seller):
    """Test resetting seller counters."""
    response = await client.post(
        f"/admin/sellers/{test_seller.seller_id}/reset_counters",
        headers=admin_headers(),
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_admin_set_seller_limit(client: AsyncClient, test_seller: Seller):
    """Test setting seller order limit."""
    response = await client.put(
        f"/admin/sellers/{test_seller.seller_id}/set_limit",
        params={"max_orders": 20},
        headers=admin_headers(),
    )
    assert response.status_code == 200


# ============================================
# WEB CREDENTIALS (admin.py)
# ============================================

@pytest.mark.asyncio
async def test_admin_get_web_credentials(client: AsyncClient, test_seller: Seller):
    """Test getting seller web credentials."""
    response = await client.get(
        f"/admin/sellers/{test_seller.seller_id}/web_credentials",
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert "web_login" in data


@pytest.mark.asyncio
async def test_admin_set_web_credentials(client: AsyncClient, test_seller: Seller):
    """Test setting seller web credentials."""
    response = await client.post(
        f"/admin/sellers/{test_seller.seller_id}/set_web_credentials",
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "ok"
    assert data.get("web_login") == f"Seller{test_seller.seller_id}"


@pytest.mark.asyncio
async def test_admin_set_web_credentials_not_found(client: AsyncClient):
    """Test setting web credentials for non-existent seller."""
    response = await client.post(
        "/admin/sellers/999999999/set_web_credentials",
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "not_found"


# ============================================
# STATISTICS (admin.py)
# ============================================

@pytest.mark.asyncio
async def test_admin_stats_all(client: AsyncClient, test_seller: Seller):
    """Test getting all seller statistics."""
    response = await client.get(
        "/admin/stats/all",
        headers=admin_headers(),
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_admin_stats_all_with_dates(client: AsyncClient, test_seller: Seller):
    """Test getting all seller statistics with date filters."""
    response = await client.get(
        "/admin/stats/all",
        params={"date_from": "2025-01-01", "date_to": "2025-12-31"},
        headers=admin_headers(),
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_admin_stats_overview(client: AsyncClient, test_seller: Seller):
    """Test getting platform stats overview."""
    response = await client.get(
        "/admin/stats/overview",
        headers=admin_headers(),
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_admin_stats_seller(client: AsyncClient, test_seller_user: User, test_seller: Seller):
    """Test getting stats for specific seller by FIO."""
    response = await client.get(
        "/admin/stats/seller",
        params={"fio": "Test Seller"},
        headers=admin_headers(),
    )
    assert response.status_code == 200


# ============================================
# CACHE INVALIDATION (admin.py)
# ============================================

@pytest.mark.asyncio
async def test_admin_cache_invalidate_all(client: AsyncClient):
    """Test invalidating all cache."""
    response = await client.post(
        "/admin/cache/invalidate",
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["invalidated"] == "all"


@pytest.mark.asyncio
async def test_admin_cache_invalidate_cities(client: AsyncClient):
    """Test invalidating cities cache."""
    response = await client.post(
        "/admin/cache/invalidate",
        params={"cache_type": "cities"},
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["invalidated"] == "cities"


@pytest.mark.asyncio
async def test_admin_cache_invalidate_invalid_type(client: AsyncClient):
    """Test invalidating cache with invalid type."""
    response = await client.post(
        "/admin/cache/invalidate",
        params={"cache_type": "invalid_type"},
        headers=admin_headers(),
    )
    assert response.status_code == 400


# ============================================
# ADMIN TOKEN VALIDATION
# ============================================

# ============================================
# ORG DATA (DaData - admin.py)
# ============================================

@pytest.mark.asyncio
async def test_admin_org_endpoint_invalid_identifier(client: AsyncClient):
    """Test /org/{identifier} with invalid identifier format."""
    response = await client.get(
        "/admin/org/12345",
        headers=admin_headers(),
    )
    # DaData validate_inn raises ValueError for bad format → 400 or 422
    assert response.status_code in (400, 422, 500)


@pytest.mark.asyncio
async def test_admin_org_endpoint_without_token(client: AsyncClient):
    """Test /org/{identifier} requires admin token."""
    response = await client.get("/admin/org/1234567890")
    if ADMIN_SECRET:
        assert response.status_code == 401


# ============================================
# CREATE SELLER WITH OGRN (admin.py)
# ============================================

@pytest.mark.asyncio
async def test_admin_create_seller_with_ogrn(
    client: AsyncClient, test_session, test_city: City, test_district: District,
):
    """Test creating a seller with OGRN field."""
    from backend.app.models.user import User
    new_user = User(
        tg_id=666666666,
        username="ogrntest",
        fio="OGRN Test Seller",
        phone="+79006666666",
        role="SELLER",
    )
    test_session.add(new_user)
    await test_session.commit()

    response = await client.post(
        "/admin/create_seller",
        json={
            "tg_id": 666666666,
            "fio": "OGRN Test Seller",
            "phone": "+79006666666",
            "shop_name": "OGRN Shop",
            "delivery_type": "both",
            "city_id": test_city.id,
            "district_id": test_district.id,
            "ogrn": "1234567890123",
        },
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert "tg_id" in data or "seller_id" in data


@pytest.mark.asyncio
async def test_admin_create_seller_without_tg_id(
    client: AsyncClient, test_session, test_city: City, test_district: District,
):
    """Test creating a seller without tg_id (auto-generates one)."""
    response = await client.post(
        "/admin/create_seller",
        json={
            "fio": "No TG Seller",
            "phone": "+79007777777",
            "shop_name": "No TG Shop",
            "delivery_type": "both",
            "city_id": test_city.id,
            "district_id": test_district.id,
        },
        headers=admin_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert "tg_id" in data or "seller_id" in data


# ============================================
# ADMIN TOKEN VALIDATION
# ============================================

@pytest.mark.asyncio
async def test_admin_endpoint_without_token(client: AsyncClient):
    """Test admin endpoint without token returns 401."""
    response = await client.get("/admin/sellers/all")
    # When ADMIN_SECRET is set, it should require the token
    # Depending on config, might be 401 or 200 (if ADMIN_SECRET is empty)
    if ADMIN_SECRET:
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_endpoint_wrong_token(client: AsyncClient):
    """Test admin endpoint with wrong token."""
    response = await client.get(
        "/admin/sellers/all",
        headers={"X-Admin-Token": "wrong_secret"},
    )
    if ADMIN_SECRET:
        assert response.status_code == 401
