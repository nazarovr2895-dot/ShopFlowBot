"""
Tests for Working Hours feature.

Tests cover:
- _current_weekday_msk() helper
- _is_open_now() helper (open, closed, day off, no restrictions)
- PUT /seller-web/working-hours endpoint (validation, save, disable)
- Public sellers list filtering (closed shops hidden from catalog)
- Public seller detail always accessible (even when closed)
"""
import os
import pytest
from datetime import datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo
from httpx import AsyncClient

from backend.app.models.seller import Seller
from backend.app.models.product import Product
from backend.app.core.password_utils import hash_password
from backend.app.services.sellers import (
    _current_weekday_msk,
    _is_open_now,
    LIMIT_TIMEZONE,
    LIMIT_DAY_START_HOUR,
)

# JWT helpers (same as test_seller_web.py)
import jwt

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
# UNIT TESTS: _current_weekday_msk
# ============================================

class TestCurrentWeekdayMsk:
    """Tests for _current_weekday_msk helper."""

    def test_after_6am_returns_today_weekday(self):
        """After 6:00 MSK, should return today's weekday."""
        # Wednesday at 10:00 MSK
        fake_now = datetime(2025, 1, 15, 10, 0, 0, tzinfo=LIMIT_TIMEZONE)
        with patch("backend.app.services.sellers.datetime") as mock_dt:
            mock_dt.now.return_value = fake_now
            mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
            result = _current_weekday_msk()
            assert result == 2  # Wednesday

    def test_before_6am_returns_yesterday_weekday(self):
        """Before 6:00 MSK, should return yesterday's weekday."""
        # Thursday at 3:00 MSK → should return Wednesday (2)
        fake_now = datetime(2025, 1, 16, 3, 0, 0, tzinfo=LIMIT_TIMEZONE)
        with patch("backend.app.services.sellers.datetime") as mock_dt:
            mock_dt.now.return_value = fake_now
            mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
            result = _current_weekday_msk()
            assert result == 2  # Wednesday (not Thursday)

    def test_at_exactly_6am_returns_today(self):
        """At exactly 6:00, should return today's weekday (boundary)."""
        # Monday at 6:00 MSK
        fake_now = datetime(2025, 1, 13, 6, 0, 0, tzinfo=LIMIT_TIMEZONE)
        with patch("backend.app.services.sellers.datetime") as mock_dt:
            mock_dt.now.return_value = fake_now
            mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
            result = _current_weekday_msk()
            assert result == 0  # Monday

    def test_sunday_before_6am_returns_saturday(self):
        """Sunday at 5:59 MSK → should return Saturday (5)."""
        fake_now = datetime(2025, 1, 19, 5, 59, 0, tzinfo=LIMIT_TIMEZONE)
        with patch("backend.app.services.sellers.datetime") as mock_dt:
            mock_dt.now.return_value = fake_now
            mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
            result = _current_weekday_msk()
            assert result == 5  # Saturday


# ============================================
# UNIT TESTS: _is_open_now
# ============================================

class TestIsOpenNow:
    """Tests for _is_open_now helper."""

    def test_none_working_hours_returns_none(self):
        """No working_hours → no restrictions."""
        assert _is_open_now(None) is None

    def test_empty_dict_returns_none(self):
        """Empty dict → no restrictions."""
        assert _is_open_now({}) is None

    def test_day_off_returns_false(self):
        """Day marked as null (day off) → closed."""
        wh = {"0": None, "1": {"open": "09:00", "close": "18:00"}}
        # Mock Monday at 12:00
        fake_now = datetime(2025, 1, 13, 12, 0, 0, tzinfo=LIMIT_TIMEZONE)
        with patch("backend.app.services.sellers.datetime") as mock_dt:
            mock_dt.now.return_value = fake_now
            mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
            result = _is_open_now(wh)
            assert result is False

    def test_within_hours_returns_true(self):
        """Current time within open-close → open."""
        wh = {"0": {"open": "09:00", "close": "18:00"}}
        # Monday at 12:00
        fake_now = datetime(2025, 1, 13, 12, 0, 0, tzinfo=LIMIT_TIMEZONE)
        with patch("backend.app.services.sellers.datetime") as mock_dt:
            mock_dt.now.return_value = fake_now
            mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
            result = _is_open_now(wh)
            assert result is True

    def test_outside_hours_returns_false(self):
        """Current time outside open-close → closed."""
        wh = {"0": {"open": "09:00", "close": "18:00"}}
        # Monday at 20:00
        fake_now = datetime(2025, 1, 13, 20, 0, 0, tzinfo=LIMIT_TIMEZONE)
        with patch("backend.app.services.sellers.datetime") as mock_dt:
            mock_dt.now.return_value = fake_now
            mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
            result = _is_open_now(wh)
            assert result is False

    def test_before_open_returns_false(self):
        """Before open time → closed."""
        wh = {"0": {"open": "09:00", "close": "18:00"}}
        # Monday at 8:30
        fake_now = datetime(2025, 1, 13, 8, 30, 0, tzinfo=LIMIT_TIMEZONE)
        with patch("backend.app.services.sellers.datetime") as mock_dt:
            mock_dt.now.return_value = fake_now
            mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
            result = _is_open_now(wh)
            assert result is False

    def test_at_open_time_returns_true(self):
        """At exactly open time → open (inclusive)."""
        wh = {"0": {"open": "09:00", "close": "18:00"}}
        # Monday at 09:00
        fake_now = datetime(2025, 1, 13, 9, 0, 0, tzinfo=LIMIT_TIMEZONE)
        with patch("backend.app.services.sellers.datetime") as mock_dt:
            mock_dt.now.return_value = fake_now
            mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
            result = _is_open_now(wh)
            assert result is True

    def test_at_close_time_returns_false(self):
        """At exactly close time → closed (exclusive)."""
        wh = {"0": {"open": "09:00", "close": "18:00"}}
        # Monday at 18:00
        fake_now = datetime(2025, 1, 13, 18, 0, 0, tzinfo=LIMIT_TIMEZONE)
        with patch("backend.app.services.sellers.datetime") as mock_dt:
            mock_dt.now.return_value = fake_now
            mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
            result = _is_open_now(wh)
            assert result is False

    def test_day_not_in_config_returns_none(self):
        """Day not in working_hours config → no restriction for that day."""
        wh = {"1": {"open": "09:00", "close": "18:00"}}  # Only Tuesday
        # Monday at 12:00
        fake_now = datetime(2025, 1, 13, 12, 0, 0, tzinfo=LIMIT_TIMEZONE)
        with patch("backend.app.services.sellers.datetime") as mock_dt:
            mock_dt.now.return_value = fake_now
            mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
            result = _is_open_now(wh)
            assert result is None

    def test_invalid_day_config_returns_none(self):
        """Invalid day config (not dict, not null) → no restriction."""
        wh = {"0": "invalid"}
        fake_now = datetime(2025, 1, 13, 12, 0, 0, tzinfo=LIMIT_TIMEZONE)
        with patch("backend.app.services.sellers.datetime") as mock_dt:
            mock_dt.now.return_value = fake_now
            mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
            result = _is_open_now(wh)
            assert result is None


# ============================================
# API TESTS: PUT /seller-web/working-hours
# ============================================

@pytest.mark.asyncio
async def test_update_working_hours_success(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test successfully setting working hours."""
    test_seller.web_login = f"Seller{test_seller.seller_id}"
    test_seller.web_password_hash = hash_password(str(test_seller.seller_id))
    await test_session.commit()

    wh = {
        "0": {"open": "09:00", "close": "18:00"},
        "1": {"open": "09:00", "close": "18:00"},
        "2": {"open": "09:00", "close": "18:00"},
        "3": {"open": "09:00", "close": "18:00"},
        "4": {"open": "09:00", "close": "18:00"},
        "5": None,
        "6": None,
    }
    response = await client.put(
        "/seller-web/working-hours",
        json={"working_hours": wh},
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["working_hours"]["5"] is None
    assert data["working_hours"]["0"]["open"] == "09:00"


@pytest.mark.asyncio
async def test_update_working_hours_disable(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test disabling working hours (set to null)."""
    test_seller.web_login = f"Seller{test_seller.seller_id}"
    test_seller.web_password_hash = hash_password(str(test_seller.seller_id))
    test_seller.working_hours = {"0": {"open": "09:00", "close": "18:00"}}
    await test_session.commit()

    response = await client.put(
        "/seller-web/working-hours",
        json={"working_hours": None},
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["working_hours"] is None


@pytest.mark.asyncio
async def test_update_working_hours_invalid_key(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test validation: invalid day key (must be 0-6)."""
    test_seller.web_login = f"Seller{test_seller.seller_id}"
    test_seller.web_password_hash = hash_password(str(test_seller.seller_id))
    await test_session.commit()

    response = await client.put(
        "/seller-web/working-hours",
        json={"working_hours": {"7": {"open": "09:00", "close": "18:00"}}},
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_update_working_hours_open_after_close(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test validation: open time must be before close time."""
    test_seller.web_login = f"Seller{test_seller.seller_id}"
    test_seller.web_password_hash = hash_password(str(test_seller.seller_id))
    await test_session.commit()

    response = await client.put(
        "/seller-web/working-hours",
        json={"working_hours": {"0": {"open": "18:00", "close": "09:00"}}},
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_update_working_hours_invalid_time_format(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    """Test validation: time must be HH:MM format."""
    test_seller.web_login = f"Seller{test_seller.seller_id}"
    test_seller.web_password_hash = hash_password(str(test_seller.seller_id))
    await test_session.commit()

    response = await client.put(
        "/seller-web/working-hours",
        json={"working_hours": {"0": {"open": "9:00", "close": "18:00"}}},
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_update_working_hours_no_auth(client: AsyncClient):
    """Test: no auth token → 401."""
    response = await client.put(
        "/seller-web/working-hours",
        json={"working_hours": None},
    )
    assert response.status_code in (401, 403)


# ============================================
# API TESTS: Public sellers filtering
# ============================================

@pytest.mark.asyncio
async def test_public_sellers_hides_closed_shops(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
    test_product: Product,
):
    """Closed shops should not appear in public seller listing."""
    # Ensure product is in stock and seller has limit
    test_product.quantity = 10
    # Make every day a day off
    wh = {str(i): None for i in range(7)}
    test_seller.working_hours = wh
    test_seller.max_orders = 10
    test_seller.default_daily_limit = 10
    test_seller.active_orders = 0
    await test_session.commit()

    response = await client.get("/public/sellers")
    assert response.status_code == 200
    data = response.json()
    seller_ids = [s["seller_id"] for s in data["sellers"]]
    assert test_seller.seller_id not in seller_ids


@pytest.mark.asyncio
async def test_public_sellers_shows_open_shops(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
    test_product: Product,
):
    """Open shops should appear in public seller listing."""
    # Ensure product is in stock and seller has limit
    test_product.quantity = 10
    # Set working hours so shop is open now (all day every day)
    wh = {str(i): {"open": "00:00", "close": "23:59"} for i in range(7)}
    test_seller.working_hours = wh
    test_seller.max_orders = 10
    test_seller.default_daily_limit = 10
    test_seller.active_orders = 0
    await test_session.commit()

    response = await client.get("/public/sellers")
    assert response.status_code == 200
    data = response.json()
    seller_ids = [s["seller_id"] for s in data["sellers"]]
    assert test_seller.seller_id in seller_ids


@pytest.mark.asyncio
async def test_public_sellers_no_restrictions(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
    test_product: Product,
):
    """Shops without working_hours should appear (no restrictions)."""
    # Ensure product is in stock and seller has limit
    test_product.quantity = 10
    test_seller.working_hours = None
    test_seller.max_orders = 10
    test_seller.default_daily_limit = 10
    test_seller.active_orders = 0
    await test_session.commit()

    response = await client.get("/public/sellers")
    assert response.status_code == 200
    data = response.json()
    seller_ids = [s["seller_id"] for s in data["sellers"]]
    assert test_seller.seller_id in seller_ids


@pytest.mark.asyncio
async def test_public_seller_detail_always_accessible(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
    test_product: Product,
):
    """Seller detail should always be accessible (even when closed)."""
    test_product.quantity = 10
    wh = {str(i): None for i in range(7)}  # All days off
    test_seller.working_hours = wh
    test_seller.default_daily_limit = 10
    await test_session.commit()

    response = await client.get(f"/public/sellers/{test_seller.seller_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["seller_id"] == test_seller.seller_id
    assert data["is_open_now"] is False
    assert data["working_hours"] is not None
