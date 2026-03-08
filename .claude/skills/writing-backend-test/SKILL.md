---
name: writing-backend-test
description: Write pytest tests for Flurai backend using async fixtures, in-memory SQLite, and proper auth helpers. Use when adding or modifying backend tests.
argument-hint: [endpoint-or-feature-to-test]
---

# Writing Backend Tests

Tests use `pytest-asyncio` + in-memory SQLite + httpx `AsyncClient`. All fixtures are in `backend/tests/conftest.py`.

## Test File Location

- Integration tests: `backend/tests/test_<module>.py`
- Unit tests: `backend/tests_unit/test_<module>.py`
- Config: `backend/pytest.ini`

## Basic Test Structure

```python
import pytest
from httpx import AsyncClient
from backend.app.models.seller import Seller
from backend.tests.conftest import get_auth_header_for_user

@pytest.mark.asyncio
async def test_feature_name(
    client: AsyncClient,
    test_session,
    test_seller: Seller,
):
    # Arrange — modify test data via test_session
    test_seller.some_field = "new_value"
    await test_session.commit()

    # Act — call API via client
    response = await client.post(
        "/seller-web/my-endpoint",
        json={"key": "value"},
        headers=seller_headers(test_seller.seller_id),
    )

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["key"] == "expected_value"
```

## Available Fixtures

| Fixture | Type | Description |
|---------|------|-------------|
| `client` | `AsyncClient` | HTTP client with overridden DB/cache deps |
| `test_session` | `AsyncSession` | Direct DB access for test data setup |
| `mock_cache` | `MockCacheService` | In-memory cache mock |
| `test_user` | `User` | Buyer (tg_id=123456789, username="testuser") |
| `test_seller_user` | `User` | Seller user (tg_id=987654321) |
| `test_seller` | `Seller` | Seller profile (depends on test_seller_user + test_city + test_district) |
| `test_product` | `Product` | Product (depends on test_seller) |
| `test_order` | `Order` | Order (depends on test_user + test_seller) |
| `test_city` | `City` | City "Москва" (id=1) |
| `test_district` | `District` | District "Центральный" (id=1, depends on test_city) |
| `test_metro` | `Metro` | Metro "Арбатская" (id=1, depends on test_district) |
| `auth_header` | `dict` | Auth header for test_user |

**Fixture cascade**: `test_seller` → `test_seller_user` + `test_city` + `test_district`

## Auth Headers

```python
from backend.tests.conftest import get_auth_header_for_user

# Telegram Mini App user (buyer)
headers = get_auth_header_for_user(user_id=123456789)
# → {"X-Telegram-Init-Data": "...HMAC-SHA256 signed data..."}

# Or use the auth_header fixture directly:
async def test_buyer(client, auth_header):
    response = await client.get("/buyers/me", headers=auth_header)
```

For seller panel endpoints, create JWT token:
```python
from backend.app.api.seller_auth import create_seller_token

def seller_headers(seller_id: int) -> dict:
    token = create_seller_token(seller_id, owner_id=seller_id, is_primary=True)
    return {"X-Seller-Token": token}
```

For admin endpoints:
```python
from backend.app.api.admin_auth import create_admin_token

def admin_headers() -> dict:
    token = create_admin_token()
    return {"X-Admin-Token": token}
```

## Critical Rules

1. **Always `@pytest.mark.asyncio`** — all tests are async
2. **Separate sessions**: `test_session` for data setup, `client` uses its own session. They're independent.
3. **Always commit**: `await test_session.commit()` after modifying test data
4. **Refresh after commit**: `await test_session.refresh(obj)` if you need updated fields
5. **Don't share state between tests**: Each test gets fresh tables (create_all → drop_all)

## Testing Patterns

### Test API endpoint:
```python
@pytest.mark.asyncio
async def test_get_orders(client, test_seller, test_order):
    response = await client.get(
        "/seller-web/orders",
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    orders = response.json()
    assert len(orders) >= 1
```

### Test with created data:
```python
@pytest.mark.asyncio
async def test_create_product(client, test_session, test_seller):
    response = await client.post(
        "/seller-web/products",
        json={"name": "Букет роз", "price": 2500, "is_active": True},
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Букет роз"
```

### Test error cases:
```python
@pytest.mark.asyncio
async def test_unauthorized_access(client):
    response = await client.get("/seller-web/orders")
    assert response.status_code in (401, 403)

@pytest.mark.asyncio
async def test_not_found(client, test_seller):
    response = await client.get(
        "/seller-web/orders/99999",
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 404
```

## Running Tests

```bash
# All tests
pytest backend/tests/ -v --tb=short

# Specific file
pytest backend/tests/test_seller_web.py -v

# Specific test
pytest backend/tests/test_seller_web.py::test_seller_login_success -v

# Critical subset (pre-commit)
pytest backend/tests/test_services.py backend/tests/test_seller_web.py backend/tests/test_buyers.py backend/tests/test_admin.py -v
```

## Reference File

Read `backend/tests/conftest.py` for all fixture definitions and auth helpers.
