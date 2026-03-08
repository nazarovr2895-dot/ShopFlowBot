---
name: adding-fastapi-endpoint
description: Add a new FastAPI endpoint following Flurai project patterns. Use when creating new API routes for seller-web, admin, public, or bot-facing endpoints.
argument-hint: [module-name] [endpoint-description]
---

# Adding a FastAPI Endpoint

When creating a new endpoint, follow the exact patterns used in this project. The architecture has **three auth systems** and **modular router structure**.

## Step 1: Determine the Module

| Module | Prefix | Auth | Header | Dependency |
|--------|--------|------|--------|------------|
| `seller_web` | `/seller-web/` | JWT | `X-Seller-Token` | `require_seller_token` (applied at router level in `__init__.py`) |
| `admin` | `/admin/` | JWT | `X-Admin-Token` | `require_admin_token` (applied via `dependencies=` in `main.py`) |
| `public` | `/public/` | None or Telegram | `X-Telegram-Init-Data` | `get_current_user()` or `get_current_user_optional()` |
| `orders` | `/orders/` | Internal | `INTERNAL_API_KEY` | None (bot-to-backend, trusted) |
| `buyers` | `/buyers/` | Telegram | `X-Telegram-Init-Data` | `get_current_user()` |

## Step 2: Create the Endpoint

### For `seller_web` (most common)

Each sub-module in `backend/app/api/seller_web/` exports a `router: APIRouter`. Auth is applied at package level — do NOT add auth dependency per-endpoint.

```python
# backend/app/api/seller_web/my_feature.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_session
from backend.app.api.seller_auth import require_seller_token
from backend.app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter()


@router.get("/my-feature")
async def get_my_feature(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    try:
        # Business logic — call service layer
        result = await my_service.get_data(session, seller_id)
        return result
    except Exception as e:
        logger.exception("get_my_feature failed", seller_id=seller_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/my-feature")
async def create_my_feature(
    data: MySchema,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    try:
        result = await my_service.create(session, seller_id, data)
        await session.commit()
        return result
    except ServiceError as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        await session.rollback()
        logger.exception("create_my_feature failed", seller_id=seller_id)
        raise HTTPException(status_code=500, detail=str(e))
```

### For `admin`

Same pattern but auth is applied in `main.py` via `dependencies=[Depends(require_admin_token)]`, so sub-modules don't need auth dependency.

## Step 3: Register the Router

### For `seller_web` sub-module:

1. Add to `backend/app/api/seller_web/__init__.py`:
```python
from backend.app.api.seller_web.my_feature import router as my_feature_router
# ...
router.include_router(my_feature_router)
```

### For a new top-level module:

Add to `backend/app/main.py`:
```python
from backend.app.api import my_module
app.include_router(my_module.router, prefix="/my-prefix", tags=["my-tag"])
```

**Registration order in main.py matters**:
1. Auth endpoints (no token)
2. Public endpoints
3. Bot-facing endpoints
4. Seller-web login (no token) → Seller-web API (with token)
5. Admin login (no token) → Admin API (with token)
6. Static files mount

## Step 4: Error Handling Pattern

```python
try:
    result = await service.do_something(session, ...)
    await session.commit()
    return result
except ServiceError as e:
    await session.rollback()
    raise HTTPException(status_code=e.status_code, detail=e.message)
except Exception as e:
    await session.rollback()
    logger.exception("endpoint_name failed")
    raise HTTPException(status_code=500, detail=str(e))
```

**Rules**:
- Always `await session.commit()` after mutations
- Always `await session.rollback()` in except blocks
- Always `logger.exception()` for unexpected errors (includes stack trace)
- Use structured logging kwargs: `logger.exception("msg", seller_id=seller_id, order_id=order_id)`

## Step 5: Key Dependencies

```python
from backend.app.api.deps import get_session          # AsyncSession
from backend.app.api.deps import get_cache             # CacheService
from backend.app.api.seller_auth import require_seller_token       # → seller_id: int
from backend.app.api.seller_auth import require_seller_token_with_owner  # → (seller_id, owner_id)
from backend.app.api.admin import require_admin_token  # Admin auth
from backend.app.core.auth import get_current_user     # Telegram user auth
from backend.app.core.auth import get_current_user_optional  # Optional Telegram auth
from backend.app.core.logging import get_logger
```

## Reference Files

Read these files for exact patterns:
- `backend/app/api/seller_web/__init__.py` — router aggregation
- `backend/app/api/seller_web/orders.py` — typical seller-web endpoint
- `backend/app/api/admin/__init__.py` — admin router aggregation
- `backend/app/main.py` — router registration
- `backend/app/api/deps.py` — dependency injection
- `backend/app/api/seller_auth.py` — seller JWT auth
