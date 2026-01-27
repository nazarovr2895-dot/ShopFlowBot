"""
Telegram WebApp Authentication Module

Validates init data from Telegram Mini App according to:
https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
"""
import hmac
import hashlib
import json
import os
import time
from urllib.parse import parse_qsl
from typing import Optional
from fastapi import HTTPException, Header, Depends
from pydantic import BaseModel


# Get BOT_TOKEN from environment
BOT_TOKEN = os.getenv("BOT_TOKEN")

# Authentication can be disabled for development/testing
# Set DISABLE_AUTH=true in environment to skip validation
DISABLE_AUTH = os.getenv("DISABLE_AUTH", "false").lower() == "true"

# Maximum age of init data in seconds (default: 1 hour)
MAX_DATA_AGE = int(os.getenv("TELEGRAM_DATA_MAX_AGE", 3600))


class TelegramUser(BaseModel):
    """User data from Telegram init data"""
    id: int
    first_name: str
    last_name: Optional[str] = None
    username: Optional[str] = None
    language_code: Optional[str] = None
    is_premium: Optional[bool] = None
    allows_write_to_pm: Optional[bool] = None
    photo_url: Optional[str] = None


class TelegramInitData(BaseModel):
    """Parsed and validated Telegram init data"""
    user: TelegramUser
    auth_date: int
    hash: str
    query_id: Optional[str] = None
    chat_type: Optional[str] = None
    chat_instance: Optional[str] = None
    start_param: Optional[str] = None


def validate_telegram_data(init_data: str) -> TelegramInitData:
    """
    Validate data received from Telegram WebApp.
    
    Args:
        init_data: URL-encoded string from Telegram.WebApp.initData
        
    Returns:
        TelegramInitData with validated user info
        
    Raises:
        HTTPException: If validation fails
    """
    if not init_data:
        raise HTTPException(status_code=401, detail="Missing Telegram init data")
    
    if not BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Server configuration error: BOT_TOKEN not set")
    
    # Parse the URL-encoded string
    try:
        parsed = dict(parse_qsl(init_data, keep_blank_values=True))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid init data format")
    
    # Extract and remove hash for validation
    received_hash = parsed.pop("hash", None)
    if not received_hash:
        raise HTTPException(status_code=401, detail="Missing hash in init data")
    
    # Check auth_date to prevent replay attacks
    try:
        auth_date = int(parsed.get("auth_date", 0))
        current_time = int(time.time())
        if current_time - auth_date > MAX_DATA_AGE:
            raise HTTPException(status_code=401, detail="Init data has expired")
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid auth_date")
    
    # Create data-check-string by sorting fields alphabetically
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(parsed.items())
    )
    
    # Create secret key: HMAC_SHA256(bot_token, "WebAppData")
    secret_key = hmac.new(
        b"WebAppData",
        BOT_TOKEN.encode("utf-8"),
        hashlib.sha256
    ).digest()
    
    # Calculate hash: HMAC_SHA256(data_check_string, secret_key)
    calculated_hash = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    
    # Verify hash
    if not hmac.compare_digest(calculated_hash, received_hash):
        raise HTTPException(status_code=401, detail="Invalid Telegram signature")
    
    # Parse user data
    user_json = parsed.get("user")
    if not user_json:
        raise HTTPException(status_code=401, detail="Missing user data")
    
    try:
        user_data = json.loads(user_json)
        user = TelegramUser(**user_data)
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(status_code=401, detail=f"Invalid user data: {e}")
    
    # Build result
    return TelegramInitData(
        user=user,
        auth_date=auth_date,
        hash=received_hash,
        query_id=parsed.get("query_id"),
        chat_type=parsed.get("chat_type"),
        chat_instance=parsed.get("chat_instance"),
        start_param=parsed.get("start_param"),
    )


async def get_current_user(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data")
) -> TelegramInitData:
    """
    FastAPI dependency to get and validate current Telegram user.
    
    Use in endpoints that require authentication:
    
        @router.post("/protected")
        async def protected_endpoint(
            user: TelegramInitData = Depends(get_current_user)
        ):
            tg_id = user.user.id
            ...
    
    Raises:
        HTTPException 401: If authentication fails
    """
    # Allow bypassing auth in development
    if DISABLE_AUTH:
        # Return a mock user for development
        return TelegramInitData(
            user=TelegramUser(
                id=0,
                first_name="DevUser",
                username="devuser"
            ),
            auth_date=int(time.time()),
            hash="dev_hash"
        )
    
    if not x_telegram_init_data:
        raise HTTPException(
            status_code=401,
            detail="Missing X-Telegram-Init-Data header"
        )
    
    return validate_telegram_data(x_telegram_init_data)


async def get_current_user_optional(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data")
) -> Optional[TelegramInitData]:
    """
    FastAPI dependency for optional authentication.
    
    Returns None if no auth header is provided, otherwise validates the data.
    
    Use in endpoints where authentication is optional:
    
        @router.get("/info")
        async def get_info(
            user: Optional[TelegramInitData] = Depends(get_current_user_optional)
        ):
            if user:
                # Show personalized info
                ...
            else:
                # Show public info
                ...
    """
    if DISABLE_AUTH:
        return None
    
    if not x_telegram_init_data:
        return None
    
    try:
        return validate_telegram_data(x_telegram_init_data)
    except HTTPException:
        # Return None for optional auth instead of failing
        return None


def verify_user_id(user: TelegramInitData, expected_user_id: int) -> bool:
    """
    Verify that the authenticated user matches the expected user ID.
    
    Args:
        user: Validated Telegram init data
        expected_user_id: The user ID that should match
        
    Returns:
        True if IDs match
        
    Raises:
        HTTPException 403: If IDs don't match
    """
    if user.user.id != expected_user_id:
        raise HTTPException(
            status_code=403,
            detail="You can only access your own data"
        )
    return True
