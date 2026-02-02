"""Admin login endpoint - no auth required."""
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

ADMIN_LOGIN = os.getenv("ADMIN_LOGIN", "adminrustam")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "1234")
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "1234")


class LoginRequest(BaseModel):
    login: str
    password: str


@router.post("/login")
async def admin_login(data: LoginRequest):
    """Проверка логина и пароля, возврат токена для API."""
    if data.login != ADMIN_LOGIN or data.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    return {"token": ADMIN_SECRET}
