"""Admin login endpoint - no auth required."""
import os
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.app.core.limiter import limiter

router = APIRouter()

# Require environment variables - no defaults in production
ADMIN_LOGIN = os.getenv("ADMIN_LOGIN")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
ADMIN_SECRET = os.getenv("ADMIN_SECRET")

# Validate required configuration
if not ADMIN_LOGIN or not ADMIN_PASSWORD or not ADMIN_SECRET:
    import sys
    print("ERROR: ADMIN_LOGIN, ADMIN_PASSWORD, and ADMIN_SECRET must be set in environment variables", file=sys.stderr)
    sys.exit(1)

# Rate limit uses app.state.limiter (set in main.py); same limiter instance from core.limiter


class LoginRequest(BaseModel):
    login: str
    password: str


@router.post("/login")
@limiter.limit("5/minute")
async def admin_login(request: Request, data: LoginRequest):
    """Проверка логина и пароля, возврат токена для API.
    
    Rate limited to 5 attempts per minute per IP address.
    """
    if data.login != ADMIN_LOGIN or data.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    return {"token": ADMIN_SECRET}
