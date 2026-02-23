"""
Test fixtures for Flurai backend tests.

Provides:
- In-memory SQLite database for isolated testing
- Async test client with proper session management
- Test data factories for creating test entities
"""
# IMPORTANT: Set environment variables BEFORE any other imports
import os

# Test bot token - used for signature verification
TEST_BOT_TOKEN = "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"

os.environ["DISABLE_AUTH"] = "false"
os.environ["BOT_TOKEN"] = TEST_BOT_TOKEN
os.environ["TELEGRAM_DATA_MAX_AGE"] = "86400"  # 24 hours for tests
# Admin credentials for admin auth tests
os.environ.setdefault("ADMIN_LOGIN", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "admin")
os.environ.setdefault("ADMIN_SECRET", "test_admin_secret")
# JWT secret for seller auth tests
os.environ.setdefault("JWT_SECRET", "test_admin_secret")
# DB settings required by Settings validation (tests use SQLite in-memory, these are not actually used)
os.environ.setdefault("DB_USER", "test")
os.environ.setdefault("DB_PASSWORD", "test")
os.environ.setdefault("DB_NAME", "test")
# Development mode for tests (disables ALLOWED_ORIGINS requirement)
os.environ.setdefault("ENVIRONMENT", "development")

import pytest
import asyncio
import hmac
import hashlib
import json
import time
from urllib.parse import urlencode
from typing import AsyncGenerator, Optional

from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)
from sqlalchemy.pool import StaticPool

from backend.app.core.base import Base
import backend.app.models.delivery_zone  # noqa: F401 — register DeliveryZone with Base.metadata
from backend.app.main import app
from backend.app.api.deps import get_session, get_cache
from backend.app.services.cache import CacheService
from backend.app.models.user import User
from backend.app.models.seller import Seller, City, District, Metro
from backend.app.models.product import Product
from backend.app.models.order import Order
from backend.app.models.cart import CartItem, BuyerFavoriteSeller, BuyerFavoriteProduct
from backend.app.models.loyalty import SellerCustomer, SellerLoyaltyTransaction

# Patch the auth module's BOT_TOKEN to match our test token
import backend.app.core.auth as auth_module
auth_module.BOT_TOKEN = TEST_BOT_TOKEN


# Test database URL - SQLite in-memory
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


# Create test engine with StaticPool for in-memory SQLite
test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    echo=False,
)

TestSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class MockCacheService:
    """Mock Redis cache for testing without actual Redis."""
    
    def __init__(self):
        self._cache = {}
    
    async def get(self, key: str):
        return self._cache.get(key)
    
    async def set(self, key: str, value, ttl: int = 300):
        self._cache[key] = value
    
    async def delete(self, key: str):
        self._cache.pop(key, None)
    
    async def get_cities(self):
        return self._cache.get("cities:all")
    
    async def set_cities(self, cities, ttl: int = 3600):
        self._cache["cities:all"] = cities
    
    async def get_districts(self, city_id: int):
        return self._cache.get(f"districts:{city_id}")
    
    async def set_districts(self, city_id: int, districts, ttl: int = 3600):
        self._cache[f"districts:{city_id}"] = districts
    
    async def get_metro(self, district_id: int):
        return self._cache.get(f"metro:{district_id}")

    async def set_metro(self, district_id: int, stations, ttl: int = 3600):
        self._cache[f"metro:{district_id}"] = stations

    # Cache invalidation methods (used by admin endpoints)
    async def invalidate_all_references(self):
        self._cache.clear()

    async def invalidate_cities(self):
        self._cache.pop("cities:all", None)

    async def invalidate_districts(self):
        keys_to_remove = [k for k in self._cache if k.startswith("districts:")]
        for k in keys_to_remove:
            self._cache.pop(k, None)

    async def invalidate_metro(self):
        keys_to_remove = [k for k in self._cache if k.startswith("metro:")]
        for k in keys_to_remove:
            self._cache.pop(k, None)


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def test_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Create a fresh database session for each test.
    Creates all tables before and drops after each test.
    """
    # Create all tables
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with TestSessionLocal() as session:
        yield session
    
    # Drop all tables after test
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def mock_cache() -> MockCacheService:
    """Provide mock cache service for testing."""
    return MockCacheService()


@pytest.fixture
async def client(
    test_session: AsyncSession,
    mock_cache: MockCacheService,
) -> AsyncGenerator[AsyncClient, None]:
    """
    Async HTTP client for testing API endpoints.
    Overrides database and cache dependencies.
    
    Note: We create a fresh session for each API call to avoid
    transaction conflicts with the test_session used for fixtures.
    """
    async def override_get_session():
        # Create a fresh session for each API request
        # This avoids "transaction already begun" errors
        async with TestSessionLocal() as session:
            yield session
    
    async def override_get_cache():
        yield mock_cache
    
    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_cache] = override_get_cache
    
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac
    
    app.dependency_overrides.clear()


# --- Test Data Factories ---

@pytest.fixture
async def test_user(test_session: AsyncSession) -> User:
    """Create a test buyer user."""
    user = User(
        tg_id=123456789,
        username="testuser",
        fio="Test User",
        phone="+79001234567",
        role="BUYER",
    )
    test_session.add(user)
    await test_session.commit()
    await test_session.refresh(user)
    return user


@pytest.fixture
async def test_seller_user(test_session: AsyncSession) -> User:
    """Create a test seller user."""
    user = User(
        tg_id=987654321,
        username="testseller",
        fio="Test Seller",
        phone="+79007654321",
        role="SELLER",
    )
    test_session.add(user)
    await test_session.commit()
    await test_session.refresh(user)
    return user


@pytest.fixture
async def test_city(test_session: AsyncSession) -> City:
    """Create a test city."""
    city = City(id=1, name="Москва")
    test_session.add(city)
    await test_session.commit()
    await test_session.refresh(city)
    return city


@pytest.fixture
async def test_district(test_session: AsyncSession, test_city: City) -> District:
    """Create a test district."""
    district = District(id=1, city_id=test_city.id, name="Центральный")
    test_session.add(district)
    await test_session.commit()
    await test_session.refresh(district)
    return district


@pytest.fixture
async def test_metro(test_session: AsyncSession, test_district: District) -> Metro:
    """Create a test metro station."""
    metro = Metro(id=1, district_id=test_district.id, name="Арбатская")
    test_session.add(metro)
    await test_session.commit()
    await test_session.refresh(metro)
    return metro


@pytest.fixture
async def test_seller(
    test_session: AsyncSession,
    test_seller_user: User,
    test_city: City,
    test_district: District,
) -> Seller:
    """Create a test seller profile."""
    seller = Seller(
        seller_id=test_seller_user.tg_id,
        shop_name="Test Shop",
        description="A test shop for testing",
        city_id=test_city.id,
        district_id=test_district.id,
        delivery_type="both",
        max_orders=10,
        active_orders=0,
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
    await test_session.commit()
    await test_session.refresh(seller)
    return seller


@pytest.fixture
async def test_product(test_session: AsyncSession, test_seller: Seller) -> Product:
    """Create a test product."""
    product = Product(
        seller_id=test_seller.seller_id,
        name="Test Product",
        description="A test product description",
        price=100.00,
        is_active=True,
    )
    test_session.add(product)
    await test_session.commit()
    await test_session.refresh(product)
    return product


@pytest.fixture
async def test_order(
    test_session: AsyncSession,
    test_user: User,
    test_seller: Seller,
) -> Order:
    """Create a test order."""
    order = Order(
        buyer_id=test_user.tg_id,
        seller_id=test_seller.seller_id,
        items_info="Test items",
        total_price=100.00,
        status="pending",
        delivery_type="pickup",
    )
    test_session.add(order)

    # Update seller pending requests (total + per-type)
    test_seller.pending_requests += 1
    test_seller.pending_pickup_requests += 1
    
    await test_session.commit()
    await test_session.refresh(order)
    return order


# --- Telegram Auth Helpers ---

def generate_telegram_init_data(
    user_id: int,
    first_name: str = "Test",
    last_name: str = "User",
    username: str = "testuser",
    bot_token: str = TEST_BOT_TOKEN,
) -> str:
    """
    Generate valid Telegram WebApp init data for testing.
    
    Creates a properly signed init data string that passes validation.
    """
    auth_date = int(time.time())
    
    user_data = {
        "id": user_id,
        "first_name": first_name,
        "last_name": last_name,
        "username": username,
        "language_code": "ru",
    }
    
    data_dict = {
        "user": json.dumps(user_data),
        "auth_date": str(auth_date),
        "query_id": "test_query_id",
    }
    
    # Create data-check-string
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(data_dict.items())
    )
    
    # Create secret key
    secret_key = hmac.new(
        b"WebAppData",
        bot_token.encode("utf-8"),
        hashlib.sha256
    ).digest()
    
    # Calculate hash
    calculated_hash = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    
    # Add hash to data
    data_dict["hash"] = calculated_hash
    
    return urlencode(data_dict)


@pytest.fixture
def auth_header(test_user: User) -> dict:
    """Generate auth header for test user."""
    init_data = generate_telegram_init_data(
        user_id=test_user.tg_id,
        first_name="Test",
        username=test_user.username or "testuser",
    )
    return {"X-Telegram-Init-Data": init_data}


def get_auth_header_for_user(user_id: int, username: str = "testuser") -> dict:
    """Generate auth header for any user ID."""
    init_data = generate_telegram_init_data(
        user_id=user_id,
        first_name="Test",
        username=username,
    )
    return {"X-Telegram-Init-Data": init_data}
