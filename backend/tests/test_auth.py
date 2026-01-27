"""
Tests for Telegram WebApp Authentication.

Tests cover:
- Init data validation
- Hash verification
- Data expiration
- User parsing
- Auth dependencies
"""
import pytest
import hmac
import hashlib
import json
import time
import os
from urllib.parse import urlencode

from httpx import AsyncClient

# Set the BOT_TOKEN before importing auth module
BOT_TOKEN = "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
os.environ["BOT_TOKEN"] = BOT_TOKEN

# Import and patch the auth module
import backend.app.core.auth as auth_module
auth_module.BOT_TOKEN = BOT_TOKEN

from backend.app.core.auth import (
    validate_telegram_data,
    TelegramInitData,
    TelegramUser,
)
from backend.tests.conftest import generate_telegram_init_data


class TestValidateTelegramData:
    """Test the validate_telegram_data function."""
    
    def test_valid_data(self):
        """Test validation of correctly signed data."""
        init_data = generate_telegram_init_data(
            user_id=123456789,
            first_name="Test",
            last_name="User",
            username="testuser",
        )
        
        result = validate_telegram_data(init_data)
        
        assert isinstance(result, TelegramInitData)
        assert result.user.id == 123456789
        assert result.user.first_name == "Test"
        assert result.user.last_name == "User"
        assert result.user.username == "testuser"
    
    def test_empty_data(self):
        """Test validation fails with empty data."""
        with pytest.raises(Exception) as exc_info:
            validate_telegram_data("")
        
        assert exc_info.value.status_code == 401
    
    def test_missing_hash(self):
        """Test validation fails when hash is missing."""
        auth_date = int(time.time())
        user_data = json.dumps({"id": 123, "first_name": "Test"})
        data_dict = {
            "user": user_data,
            "auth_date": str(auth_date),
        }
        init_data = urlencode(data_dict)
        
        with pytest.raises(Exception) as exc_info:
            validate_telegram_data(init_data)
        
        assert exc_info.value.status_code == 401
        assert "hash" in exc_info.value.detail.lower()
    
    def test_invalid_hash(self):
        """Test validation fails with wrong hash."""
        auth_date = int(time.time())
        user_data = json.dumps({"id": 123, "first_name": "Test"})
        data_dict = {
            "user": user_data,
            "auth_date": str(auth_date),
            "hash": "invalid_hash_12345678901234567890123456789012345678901234567890",
        }
        init_data = urlencode(data_dict)
        
        with pytest.raises(Exception) as exc_info:
            validate_telegram_data(init_data)
        
        assert exc_info.value.status_code == 401
        assert "signature" in exc_info.value.detail.lower()
    
    def test_expired_data(self):
        """Test validation fails when data is too old."""
        # Generate valid data but with old timestamp
        auth_date = int(time.time()) - 100000  # Very old
        
        user_data = {
            "id": 123456789,
            "first_name": "Test",
            "last_name": "User",
            "username": "testuser",
            "language_code": "ru",
        }
        
        data_dict = {
            "user": json.dumps(user_data),
            "auth_date": str(auth_date),
            "query_id": "test_query_id",
        }
        
        # Create valid signature
        data_check_string = "\n".join(
            f"{k}={v}" for k, v in sorted(data_dict.items())
        )
        secret_key = hmac.new(
            b"WebAppData",
            BOT_TOKEN.encode("utf-8"),
            hashlib.sha256
        ).digest()
        calculated_hash = hmac.new(
            secret_key,
            data_check_string.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()
        
        data_dict["hash"] = calculated_hash
        init_data = urlencode(data_dict)
        
        with pytest.raises(Exception) as exc_info:
            validate_telegram_data(init_data)
        
        assert exc_info.value.status_code == 401
        assert "expired" in exc_info.value.detail.lower()
    
    def test_missing_user_data(self):
        """Test validation fails when user data is missing."""
        auth_date = int(time.time())
        
        data_dict = {
            "auth_date": str(auth_date),
            "query_id": "test_query_id",
        }
        
        # Create valid signature
        data_check_string = "\n".join(
            f"{k}={v}" for k, v in sorted(data_dict.items())
        )
        secret_key = hmac.new(
            b"WebAppData",
            BOT_TOKEN.encode("utf-8"),
            hashlib.sha256
        ).digest()
        calculated_hash = hmac.new(
            secret_key,
            data_check_string.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()
        
        data_dict["hash"] = calculated_hash
        init_data = urlencode(data_dict)
        
        with pytest.raises(Exception) as exc_info:
            validate_telegram_data(init_data)
        
        assert exc_info.value.status_code == 401
        # Note: validation may fail at signature check or user check
        assert "user" in exc_info.value.detail.lower() or "signature" in exc_info.value.detail.lower()
    
    def test_invalid_user_json(self):
        """Test validation fails with malformed user JSON."""
        auth_date = int(time.time())
        
        data_dict = {
            "user": "not_valid_json{{{",
            "auth_date": str(auth_date),
        }
        
        # Create valid signature
        data_check_string = "\n".join(
            f"{k}={v}" for k, v in sorted(data_dict.items())
        )
        secret_key = hmac.new(
            b"WebAppData",
            BOT_TOKEN.encode("utf-8"),
            hashlib.sha256
        ).digest()
        calculated_hash = hmac.new(
            secret_key,
            data_check_string.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()
        
        data_dict["hash"] = calculated_hash
        init_data = urlencode(data_dict)
        
        with pytest.raises(Exception) as exc_info:
            validate_telegram_data(init_data)
        
        assert exc_info.value.status_code == 401


class TestTelegramModels:
    """Test Telegram data models."""
    
    def test_telegram_user_minimal(self):
        """Test TelegramUser with minimal data."""
        user = TelegramUser(id=123, first_name="Test")
        
        assert user.id == 123
        assert user.first_name == "Test"
        assert user.last_name is None
        assert user.username is None
    
    def test_telegram_user_full(self):
        """Test TelegramUser with all fields."""
        user = TelegramUser(
            id=123456789,
            first_name="Test",
            last_name="User",
            username="testuser",
            language_code="ru",
            is_premium=True,
            allows_write_to_pm=True,
            photo_url="https://t.me/i/userpic/..."
        )
        
        assert user.id == 123456789
        assert user.first_name == "Test"
        assert user.last_name == "User"
        assert user.username == "testuser"
        assert user.language_code == "ru"
        assert user.is_premium is True
        assert user.allows_write_to_pm is True
    
    def test_telegram_init_data_minimal(self):
        """Test TelegramInitData with minimal fields."""
        user = TelegramUser(id=123, first_name="Test")
        init_data = TelegramInitData(
            user=user,
            auth_date=1234567890,
            hash="test_hash",
        )
        
        assert init_data.user.id == 123
        assert init_data.auth_date == 1234567890
        assert init_data.hash == "test_hash"
        assert init_data.query_id is None
    
    def test_telegram_init_data_full(self):
        """Test TelegramInitData with all fields."""
        user = TelegramUser(id=123, first_name="Test")
        init_data = TelegramInitData(
            user=user,
            auth_date=1234567890,
            hash="test_hash",
            query_id="AAHdF6IQ",
            chat_type="private",
            chat_instance="12345",
            start_param="ref123",
        )
        
        assert init_data.query_id == "AAHdF6IQ"
        assert init_data.chat_type == "private"
        assert init_data.chat_instance == "12345"
        assert init_data.start_param == "ref123"


@pytest.mark.asyncio
class TestAuthEndpoints:
    """Test authentication in API endpoints."""
    
    async def test_protected_endpoint_without_auth(self, client: AsyncClient):
        """Test that protected endpoint works without auth (optional auth)."""
        # The create order endpoint has optional auth
        # It should still work but bypass user validation
        response = await client.post("/orders/create", json={
            "buyer_id": 123,
            "seller_id": 456,
            "items_info": "Test",
            "total_price": "100.00",
            "delivery_type": "pickup",
        })
        
        # Should fail because seller doesn't exist, not because of auth
        assert response.status_code == 404
    
    async def test_protected_endpoint_with_valid_auth(
        self,
        client: AsyncClient,
        test_user,
        test_seller,
    ):
        """Test protected endpoint with valid authentication."""
        init_data = generate_telegram_init_data(
            user_id=test_user.tg_id,
            username=test_user.username or "testuser",
        )
        headers = {"X-Telegram-Init-Data": init_data}
        
        response = await client.post(
            "/orders/create",
            json={
                "buyer_id": test_user.tg_id,
                "seller_id": test_seller.seller_id,
                "items_info": "Test item",
                "total_price": "100.00",
                "delivery_type": "pickup",
            },
            headers=headers,
        )
        
        assert response.status_code == 200
    
    async def test_protected_endpoint_user_mismatch(
        self,
        client: AsyncClient,
        test_user,
        test_seller,
    ):
        """Test that user can't create order for different user."""
        # Authenticate as test_user but try to create order for different buyer
        init_data = generate_telegram_init_data(
            user_id=test_user.tg_id,
            username=test_user.username or "testuser",
        )
        headers = {"X-Telegram-Init-Data": init_data}
        
        response = await client.post(
            "/orders/create",
            json={
                "buyer_id": 999999999,  # Different user
                "seller_id": test_seller.seller_id,
                "items_info": "Test item",
                "total_price": "100.00",
                "delivery_type": "pickup",
            },
            headers=headers,
        )
        
        # Should be forbidden
        assert response.status_code == 403
    
    async def test_protected_endpoint_with_invalid_auth(
        self,
        client: AsyncClient,
        test_user,
        test_seller,
    ):
        """Test protected endpoint with invalid authentication."""
        headers = {"X-Telegram-Init-Data": "invalid_data_here"}
        
        response = await client.post(
            "/orders/create",
            json={
                "buyer_id": test_user.tg_id,
                "seller_id": test_seller.seller_id,
                "items_info": "Test item",
                "total_price": "100.00",
                "delivery_type": "pickup",
            },
            headers=headers,
        )
        
        # With optional auth, invalid data is ignored
        # So it should work (unless the request itself fails for other reasons)
        # The order should be created successfully
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_health_check_no_auth_required(client: AsyncClient):
    """Test that health check doesn't require authentication."""
    response = await client.get("/health")
    
    # Health check should work without auth
    # May fail due to Redis not being available, but not due to auth
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_root_endpoint_no_auth_required(client: AsyncClient):
    """Test that root endpoint doesn't require authentication."""
    response = await client.get("/")
    
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio  
async def test_public_endpoints_no_auth_required(client: AsyncClient, test_city):
    """Test that public endpoints don't require authentication."""
    # Public sellers list
    response = await client.get("/public/sellers")
    assert response.status_code == 200
    
    # Cities
    response = await client.get("/public/cities")
    assert response.status_code == 200
    
    # Districts
    response = await client.get(f"/public/districts/{test_city.id}")
    assert response.status_code == 200
