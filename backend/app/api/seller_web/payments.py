"""YooKassa OAuth + Commission balance endpoints."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ._common import (
    logger,
    require_seller_token_with_owner,
    get_session,
    Seller,
)

router = APIRouter()


# --- YOOKASSA OAUTH ---


@router.get("/yookassa/connect")
async def yookassa_connect(
    auth: tuple = Depends(require_seller_token_with_owner),
):
    """Generate YooKassa OAuth URL and return it for redirect."""
    from backend.app.core.settings import get_settings
    settings = get_settings()
    if not settings.YOOKASSA_OAUTH_CLIENT_ID or not settings.YOOKASSA_OAUTH_REDIRECT_URI:
        raise HTTPException(status_code=503, detail="YooKassa OAuth не настроен")

    seller_id, _owner_id = auth
    import secrets
    state = f"{seller_id}_{secrets.token_urlsafe(16)}"

    oauth_url = (
        f"https://yookassa.ru/oauth/v2/authorize"
        f"?client_id={settings.YOOKASSA_OAUTH_CLIENT_ID}"
        f"&response_type=code"
        f"&state={state}"
    )
    return {"oauth_url": oauth_url, "state": state}


@router.get("/yookassa/callback")
async def yookassa_callback(
    code: str = Query(...),
    state: str = Query(""),
    session: AsyncSession = Depends(get_session),
):
    """Exchange YooKassa OAuth code for token and save to seller."""
    import httpx
    from backend.app.core.settings import get_settings
    settings = get_settings()

    if not settings.YOOKASSA_OAUTH_CLIENT_ID or not settings.YOOKASSA_OAUTH_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="YooKassa OAuth не настроен")

    # Extract seller_id from state
    try:
        seller_id = int(state.split("_")[0])
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Некорректный state параметр")

    seller = await session.get(Seller, seller_id)
    if not seller:
        raise HTTPException(status_code=404, detail="Продавец не найден")

    # Exchange code for token
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://yookassa.ru/oauth/v2/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
            },
            auth=(settings.YOOKASSA_OAUTH_CLIENT_ID, settings.YOOKASSA_OAUTH_CLIENT_SECRET),
        )

    if resp.status_code != 200:
        logger.error("YooKassa OAuth token exchange failed", status=resp.status_code, body=resp.text)
        raise HTTPException(status_code=502, detail="Не удалось получить токен ЮКассы")

    token_data = resp.json()
    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=502, detail="ЮКасса не вернула access_token")

    # Fetch merchant info to get shopId
    async with httpx.AsyncClient() as client:
        me_resp = await client.get(
            "https://api.yookassa.ru/v3/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    shop_id = None
    if me_resp.status_code == 200:
        me_data = me_resp.json()
        shop_id = str(me_data.get("account_id", ""))

    seller.yookassa_oauth_token = access_token
    seller.yookassa_shop_id = shop_id
    seller.yookassa_connected_at = datetime.utcnow()
    await session.commit()

    logger.info("YooKassa OAuth connected", seller_id=seller_id, shop_id=shop_id)

    # Redirect to seller panel settings page
    from starlette.responses import RedirectResponse
    return RedirectResponse(url="/settings?tab=payment&yookassa=connected")


@router.post("/yookassa/disconnect")
async def yookassa_disconnect(
    auth: tuple = Depends(require_seller_token_with_owner),
    session: AsyncSession = Depends(get_session),
):
    """Disconnect YooKassa OAuth — clear token."""
    seller_id, _owner_id = auth
    seller = await session.get(Seller, seller_id)
    if not seller:
        raise HTTPException(status_code=404, detail="Продавец не найден")

    seller.yookassa_oauth_token = None
    seller.yookassa_shop_id = None
    seller.yookassa_connected_at = None
    await session.commit()

    logger.info("YooKassa OAuth disconnected", seller_id=seller_id)
    return {"status": "ok"}


# --- COMMISSION BALANCE ---


@router.get("/commission/balance")
async def get_commission_balance_endpoint(
    auth: tuple = Depends(require_seller_token_with_owner),
    session: AsyncSession = Depends(get_session),
):
    """Get current commission balance for the seller."""
    seller_id, _owner_id = auth
    from backend.app.services.commissions import get_commission_balance, get_effective_commission_rate
    balance = await get_commission_balance(session, seller_id)
    rate = await get_effective_commission_rate(session, seller_id)
    return {
        "balance": float(balance),
        "commission_rate": rate,
    }


@router.get("/commission/history")
async def get_commission_history_endpoint(
    auth: tuple = Depends(require_seller_token_with_owner),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    """Get commission history for the seller."""
    seller_id, _owner_id = auth
    from backend.app.services.commissions import get_commission_history
    entries = await get_commission_history(session, seller_id, limit, offset)
    return {"entries": entries}
