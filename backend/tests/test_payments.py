"""
Unit tests for PaymentService — YuKassa integration via OAuth Partner API.

Tests cover:
- items_info parsing (new + legacy format)
- Receipt building (54-ФЗ compliance, delivery/discount adjustments)
- Payment creation via seller's OAuth token (httpx-based)
- Webhook processing (status updates, commission recording, notifications)
- Payment status fetching (fresh & cached fallback)
- Refund operations (full & partial)

All YuKassa API calls are mocked via httpx — no external network calls.
"""
import pytest
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional
from unittest.mock import AsyncMock, MagicMock, patch
from types import SimpleNamespace

from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.user import User
from backend.app.models.seller import Seller
from backend.app.models.product import Product
from backend.app.models.order import Order


# ============================================
# Helpers
# ============================================

def _make_yoo_payment_dict(
    payment_id: str = "pay_123",
    status: str = "pending",
    paid: bool = False,
    confirmation_url: str = "https://yoomoney.ru/checkout/pay_123",
    created_at: Optional[str] = None,
    amount_value: str = "8000.00",
):
    """Create a dict matching YooKassa API payment response."""
    return {
        "id": payment_id,
        "status": status,
        "paid": paid,
        "created_at": created_at or datetime.now(timezone.utc).isoformat(),
        "confirmation": {"confirmation_url": confirmation_url},
        "amount": {"value": amount_value, "currency": "RUB"},
    }


def _make_yoo_refund_dict(
    refund_id: str = "ref_456",
    status: str = "succeeded",
    amount_value: str = "8000.00",
):
    """Create a dict matching YooKassa API refund response."""
    return {
        "id": refund_id,
        "status": status,
        "amount": {"value": amount_value, "currency": "RUB"},
    }


def _mock_httpx_response(json_data: dict, status_code: int = 200):
    """Create a mock httpx.Response with given JSON payload."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data
    resp.text = str(json_data)
    return resp


def _httpx_patch(response_or_side_effect):
    """
    Return a patch context manager for httpx.AsyncClient that returns the
    given mock response (or raises if side_effect is an exception).

    Returns (patch_ctx, mock_client) — use `mock_client.request` to inspect calls.
    """
    mock_client = AsyncMock()
    if isinstance(response_or_side_effect, Exception):
        mock_client.request.side_effect = response_or_side_effect
    else:
        mock_client.request.return_value = response_or_side_effect

    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    patcher = patch("httpx.AsyncClient", return_value=mock_client)
    return patcher, mock_client


def _httpx_patch_multi(responses: list):
    """
    Patch httpx.AsyncClient so that successive .request() calls return
    the given list of responses in order.
    """
    mock_client = AsyncMock()
    mock_client.request.side_effect = responses
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    patcher = patch("httpx.AsyncClient", return_value=mock_client)
    return patcher, mock_client


@pytest.fixture
async def payment_order(
    test_session: AsyncSession,
    test_user: User,
    test_seller: Seller,
    test_product: Product,
) -> Order:
    """Create a test order with items_info in new format (with embedded price)."""
    order = Order(
        buyer_id=test_user.tg_id,
        seller_id=test_seller.seller_id,
        items_info=f"{test_product.id}:Test Product@100.00 x 2",
        total_price=200.00,
        status="accepted",
        delivery_type="delivery",
    )
    test_session.add(order)
    await test_session.commit()
    await test_session.refresh(order)
    return order


@pytest.fixture
async def paid_order(
    test_session: AsyncSession,
    test_user: User,
    test_seller: Seller,
    test_product: Product,
) -> Order:
    """Create a test order that has already been paid."""
    order = Order(
        buyer_id=test_user.tg_id,
        seller_id=test_seller.seller_id,
        items_info=f"{test_product.id}:Test Product@100.00 x 2",
        total_price=200.00,
        status="accepted",
        delivery_type="delivery",
        payment_id="pay_existing_123",
        payment_status="succeeded",
    )
    test_session.add(order)
    await test_session.commit()
    await test_session.refresh(order)
    return order


@pytest.fixture
def mock_yookassa_configured():
    """Patch settings so PaymentService has return URL configured."""
    with patch("backend.app.services.payment.get_settings") as mock_settings:
        settings = MagicMock()
        settings.YOOKASSA_RETURN_URL = "https://app.flurai.ru/?tab=orders"
        mock_settings.return_value = settings
        yield settings


@pytest.fixture
def mock_yookassa_not_configured():
    """Patch settings so PaymentService sees no return URL."""
    with patch("backend.app.services.payment.get_settings") as mock_settings:
        settings = MagicMock()
        settings.YOOKASSA_RETURN_URL = None
        mock_settings.return_value = settings
        yield settings


# ============================================
# SELLER ONBOARDING (replaces SDK configuration tests)
# ============================================

@pytest.mark.asyncio
async def test_service_raises_when_seller_not_onboarded(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
    test_seller: Seller,
):
    """PaymentService raises SellerNotOnboardedError when seller has no OAuth token."""
    from backend.app.services.payment import PaymentService, SellerNotOnboardedError

    # Ensure seller has no OAuth token
    test_seller.yookassa_oauth_token = None
    await test_session.commit()

    service = PaymentService(test_session)
    with pytest.raises(SellerNotOnboardedError):
        await service.create_payment(order_id=payment_order.id)


@pytest.mark.asyncio
async def test_seller_api_request_uses_bearer_token(
    test_session: AsyncSession,
    test_seller: Seller,
):
    """_seller_api_request sends Bearer token in Authorization header."""
    from backend.app.services.payment import PaymentService

    test_seller.yookassa_oauth_token = "oauth_token_abc"
    await test_session.commit()

    resp = _mock_httpx_response({"id": "pay_1", "status": "pending"})
    patcher, mock_client = _httpx_patch(resp)

    with patcher:
        service = PaymentService(test_session)
        result = await service._seller_api_request(
            test_seller, "GET", "/payments/pay_1",
        )

    assert result["id"] == "pay_1"
    call_args = mock_client.request.call_args
    headers = call_args.kwargs.get("headers") or call_args[1].get("headers", {})
    assert headers["Authorization"] == "Bearer oauth_token_abc"


@pytest.mark.asyncio
async def test_seller_api_request_raises_on_http_error(
    test_session: AsyncSession,
    test_seller: Seller,
):
    """_seller_api_request raises PaymentServiceError on 4xx/5xx."""
    from backend.app.services.payment import PaymentService, PaymentServiceError

    test_seller.yookassa_oauth_token = "oauth_token_abc"
    await test_session.commit()

    resp = _mock_httpx_response({"type": "error"}, status_code=401)
    patcher, _ = _httpx_patch(resp)

    with patcher:
        service = PaymentService(test_session)
        with pytest.raises(PaymentServiceError, match="YooKassa API error 401"):
            await service._seller_api_request(
                test_seller, "GET", "/payments/pay_1",
            )


# ============================================
# _parse_items_info
# ============================================

@pytest.mark.asyncio
async def test_parse_items_new_format(
    test_session: AsyncSession,
    mock_yookassa_configured,
):
    """Parse items_info in new format: '123:Розы@150.00 x 2'."""
    from backend.app.services.payment import PaymentService

    service = PaymentService(test_session)
    items = service._parse_items_info("1:Розы@150.00 x 2, 5:Тюльпаны@200.50 x 3")

    assert len(items) == 2
    assert items[0] == {
        "product_id": 1,
        "name": "Розы",
        "quantity": 2,
        "price": Decimal("150.00"),
    }
    assert items[1] == {
        "product_id": 5,
        "name": "Тюльпаны",
        "quantity": 3,
        "price": Decimal("200.50"),
    }


@pytest.mark.asyncio
async def test_parse_items_legacy_format(
    test_session: AsyncSession,
    mock_yookassa_configured,
):
    """Parse items_info in legacy format without prices: '123:Розы x 2'."""
    from backend.app.services.payment import PaymentService

    service = PaymentService(test_session)
    items = service._parse_items_info("1:Розы x 2, 5:Тюльпаны x 3")

    assert len(items) == 2
    assert items[0] == {"product_id": 1, "name": "Розы", "quantity": 2}
    assert items[1] == {"product_id": 5, "name": "Тюльпаны", "quantity": 3}
    # Legacy items should NOT have a "price" key
    assert "price" not in items[0]


@pytest.mark.asyncio
async def test_parse_items_empty_string(
    test_session: AsyncSession,
    mock_yookassa_configured,
):
    """Parsing empty/null items_info returns empty list."""
    from backend.app.services.payment import PaymentService

    service = PaymentService(test_session)
    assert service._parse_items_info("") == []
    assert service._parse_items_info(None) == []


@pytest.mark.asyncio
async def test_parse_items_unicode_cross(
    test_session: AsyncSession,
    mock_yookassa_configured,
):
    """Parse items_info with × (unicode cross) instead of x."""
    from backend.app.services.payment import PaymentService

    service = PaymentService(test_session)
    items = service._parse_items_info("1:Букет@500.00 × 1")

    assert len(items) == 1
    assert items[0]["name"] == "Букет"
    assert items[0]["quantity"] == 1
    assert items[0]["price"] == Decimal("500.00")


# ============================================
# _build_receipt
# ============================================

@pytest.mark.asyncio
async def test_build_receipt_with_phone(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
    test_user: User,
):
    """Receipt includes buyer phone from User model."""
    from backend.app.services.payment import PaymentService

    service = PaymentService(test_session)
    receipt = await service._build_receipt(payment_order, Decimal("200.00"))

    assert receipt["customer"]["phone"] == test_user.phone
    assert len(receipt["items"]) == 1  # 1 product line
    assert receipt["items"][0]["description"] == "Test Product"
    assert receipt["items"][0]["amount"]["value"] == "100.00"
    assert receipt["items"][0]["quantity"] == "2"
    assert receipt["items"][0]["vat_code"] == 1


@pytest.mark.asyncio
async def test_build_receipt_guest_phone_fallback(
    test_session: AsyncSession,
    mock_yookassa_configured,
    test_seller: Seller,
):
    """Receipt uses guest_phone when buyer has no User record phone."""
    from backend.app.services.payment import PaymentService

    # Create order with buyer that has no phone, but guest_phone is set
    order = Order(
        buyer_id=None,  # Guest order
        seller_id=test_seller.seller_id,
        items_info="1:Розы@300.00 x 1",
        total_price=300.00,
        status="accepted",
        delivery_type="pickup",
        guest_phone="+79001112233",
    )
    test_session.add(order)
    await test_session.commit()
    await test_session.refresh(order)

    service = PaymentService(test_session)
    receipt = await service._build_receipt(order, Decimal("300.00"))

    assert receipt["customer"]["phone"] == "+79001112233"


@pytest.mark.asyncio
async def test_build_receipt_email_fallback(
    test_session: AsyncSession,
    mock_yookassa_configured,
    test_seller: Seller,
):
    """Receipt falls back to email when no phone available."""
    from backend.app.services.payment import PaymentService

    # No buyer_id, no guest_phone
    order = Order(
        buyer_id=None,
        seller_id=test_seller.seller_id,
        items_info="1:Розы@300.00 x 1",
        total_price=300.00,
        status="accepted",
        delivery_type="pickup",
    )
    test_session.add(order)
    await test_session.commit()
    await test_session.refresh(order)

    service = PaymentService(test_session)
    receipt = await service._build_receipt(order, Decimal("300.00"))

    assert receipt["customer"]["email"] == "buyer@flurai.ru"


@pytest.mark.asyncio
async def test_build_receipt_delivery_fee_adjustment(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
):
    """Receipt adds 'Доставка' line when total > items subtotal."""
    from backend.app.services.payment import PaymentService

    service = PaymentService(test_session)
    # Items total = 100 * 2 = 200, but we charge 250 (delivery fee 50)
    receipt = await service._build_receipt(payment_order, Decimal("250.00"))

    descriptions = [item["description"] for item in receipt["items"]]
    assert "Доставка" in descriptions
    delivery_item = [i for i in receipt["items"] if i["description"] == "Доставка"][0]
    assert delivery_item["amount"]["value"] == "50.00"
    assert delivery_item["payment_subject"] == "service"


@pytest.mark.asyncio
async def test_build_receipt_discount_adjustment(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
):
    """Receipt reduces item prices proportionally when total < items subtotal (discount)."""
    from backend.app.services.payment import PaymentService

    service = PaymentService(test_session)
    # Items total = 100 * 2 = 200, but total is 180 (20 discount)
    receipt = await service._build_receipt(payment_order, Decimal("180.00"))

    # No "Доставка" line should be added
    descriptions = [item["description"] for item in receipt["items"]]
    assert "Доставка" not in descriptions

    # Price should be reduced (100 - 10 = 90 per unit since 20/200 * 200 = 20, distributed to 2 units)
    item = receipt["items"][0]
    assert Decimal(item["amount"]["value"]) < Decimal("100.00")


@pytest.mark.asyncio
async def test_build_receipt_fallback_deleted_product(
    test_session: AsyncSession,
    mock_yookassa_configured,
    test_seller: Seller,
):
    """Receipt falls back to single order line when products are deleted."""
    from backend.app.services.payment import PaymentService

    # Order references non-existent product ID in legacy format (no price)
    order = Order(
        buyer_id=None,
        seller_id=test_seller.seller_id,
        items_info="99999:Удалённый товар x 1",
        total_price=500.00,
        status="accepted",
        delivery_type="pickup",
    )
    test_session.add(order)
    await test_session.commit()
    await test_session.refresh(order)

    service = PaymentService(test_session)
    receipt = await service._build_receipt(order, Decimal("500.00"))

    assert len(receipt["items"]) == 1
    assert receipt["items"][0]["description"] == f"Заказ #{order.id}"
    assert receipt["items"][0]["amount"]["value"] == "500.00"


@pytest.mark.asyncio
async def test_build_receipt_description_truncation(
    test_session: AsyncSession,
    mock_yookassa_configured,
    test_seller: Seller,
):
    """Receipt item descriptions are truncated to 128 chars (YooKassa limit)."""
    from backend.app.services.payment import PaymentService

    long_name = "А" * 200
    order = Order(
        buyer_id=None,
        seller_id=test_seller.seller_id,
        items_info=f"1:{long_name}@100.00 x 1",
        total_price=100.00,
        status="accepted",
        delivery_type="pickup",
    )
    test_session.add(order)
    await test_session.commit()
    await test_session.refresh(order)

    service = PaymentService(test_session)
    receipt = await service._build_receipt(order, Decimal("100.00"))

    assert len(receipt["items"][0]["description"]) == 128


# ============================================
# create_payment
# ============================================

@pytest.mark.asyncio
async def test_create_payment_via_oauth(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
    test_seller: Seller,
):
    """Create payment using seller's OAuth token — money goes directly to seller."""
    from backend.app.services.payment import PaymentService

    # Set seller's OAuth token
    test_seller.yookassa_oauth_token = "test_oauth_token_123"
    test_seller.yookassa_shop_id = "seller_shop_123"
    await test_session.commit()

    mock_response = _mock_httpx_response({
        "id": "pay_123",
        "status": "pending",
        "confirmation": {"confirmation_url": "https://yoomoney.ru/checkout/pay_123"},
        "amount": {"value": "200.00", "currency": "RUB"},
    })

    patcher, mock_client = _httpx_patch(mock_response)

    with patcher:
        service = PaymentService(test_session)
        result = await service.create_payment(payment_order.id)

    assert result["payment_id"] == "pay_123"
    assert result["status"] == "pending"
    assert result["confirmation_url"] == "https://yoomoney.ru/checkout/pay_123"

    # Verify order was updated
    await test_session.refresh(payment_order)
    assert payment_order.payment_id == "pay_123"
    assert payment_order.payment_status == "pending"

    # Verify OAuth token was used (Bearer auth)
    call_args = mock_client.request.call_args
    assert "Bearer test_oauth_token_123" in str(call_args)

    # Verify NO transfers in payment params (direct to seller)
    json_data = call_args.kwargs.get("json") or call_args[1].get("json", {})
    assert "transfers" not in json_data


@pytest.mark.asyncio
async def test_create_payment_order_not_found(
    test_session: AsyncSession,
    mock_yookassa_configured,
):
    """create_payment raises 404 for non-existent order."""
    from backend.app.services.payment import PaymentService, PaymentServiceError

    service = PaymentService(test_session)
    with pytest.raises(PaymentServiceError, match="not found") as exc_info:
        await service.create_payment(order_id=99999)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_create_payment_reuses_fresh_payment(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
    test_seller: Seller,
):
    """Reuse existing pending payment if it's still fresh (< 10 min old)."""
    from backend.app.services.payment import PaymentService

    test_seller.yookassa_oauth_token = "test_oauth_token"
    payment_order.payment_id = "pay_existing"
    await test_session.commit()

    fresh_time = datetime.now(timezone.utc).isoformat()
    existing_payment = _make_yoo_payment_dict(
        payment_id="pay_existing",
        status="pending",
        created_at=fresh_time,
    )

    # Only one API call expected: GET to check existing payment (no POST to create)
    resp = _mock_httpx_response(existing_payment)
    patcher, mock_client = _httpx_patch(resp)

    with patcher:
        service = PaymentService(test_session)
        result = await service.create_payment(payment_order.id)

    assert result["payment_id"] == "pay_existing"
    assert result["status"] == "pending"
    # Should have called GET only once — no POST create
    assert mock_client.request.call_count == 1
    call_args = mock_client.request.call_args
    assert call_args[0][0] == "GET"  # method


@pytest.mark.asyncio
async def test_create_payment_cancels_stale_payment(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
    test_seller: Seller,
):
    """Cancel stale payment (> 10 min old) and create a new one."""
    from backend.app.services.payment import PaymentService

    test_seller.yookassa_oauth_token = "test_oauth_token"
    payment_order.payment_id = "pay_stale"
    await test_session.commit()

    stale_time = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    stale_payment = _make_yoo_payment_dict(
        payment_id="pay_stale",
        status="pending",
        created_at=stale_time,
    )
    cancel_resp = _mock_httpx_response({"id": "pay_stale", "status": "canceled"})
    new_payment = _mock_httpx_response({
        "id": "pay_new",
        "status": "pending",
        "confirmation": {"confirmation_url": "https://yoomoney.ru/checkout/pay_new"},
        "amount": {"value": "200.00", "currency": "RUB"},
    })

    # Sequence: GET existing -> POST cancel -> POST create
    stale_resp = _mock_httpx_response(stale_payment)
    patcher, mock_client = _httpx_patch_multi([stale_resp, cancel_resp, new_payment])

    with patcher:
        service = PaymentService(test_session)
        result = await service.create_payment(payment_order.id)

    assert result["payment_id"] == "pay_new"
    # Should have had 3 calls: GET, POST cancel, POST create
    assert mock_client.request.call_count == 3
    methods = [c[0][0] for c in mock_client.request.call_args_list]
    assert methods[0] == "GET"
    assert methods[1] == "POST"  # cancel
    assert methods[2] == "POST"  # create


@pytest.mark.asyncio
async def test_create_payment_api_failure(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
    test_seller: Seller,
):
    """Raise PaymentServiceError with 502 when YooKassa API fails."""
    from backend.app.services.payment import PaymentService, PaymentServiceError

    test_seller.yookassa_oauth_token = "test_oauth_token"
    await test_session.commit()

    error_resp = _mock_httpx_response({"type": "error", "description": "Server error"}, status_code=500)
    patcher, _ = _httpx_patch(error_resp)

    with patcher:
        service = PaymentService(test_session)
        with pytest.raises(PaymentServiceError, match="Payment creation failed") as exc_info:
            await service.create_payment(payment_order.id)
        assert exc_info.value.status_code == 502


@pytest.mark.asyncio
async def test_create_payment_custom_return_url(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
    test_seller: Seller,
):
    """Custom return_url overrides settings default."""
    from backend.app.services.payment import PaymentService

    test_seller.yookassa_oauth_token = "test_oauth_token"
    await test_session.commit()

    new_payment_data = {
        "id": "pay_custom",
        "status": "pending",
        "confirmation": {"confirmation_url": "https://yoomoney.ru/checkout/pay_custom"},
        "amount": {"value": "200.00", "currency": "RUB"},
    }
    resp = _mock_httpx_response(new_payment_data)
    patcher, mock_client = _httpx_patch(resp)

    with patcher:
        service = PaymentService(test_session)
        await service.create_payment(
            payment_order.id,
            return_url="https://custom.url/done",
        )

    # Find the POST /payments call (may be the only one if no existing payment)
    for call in mock_client.request.call_args_list:
        method = call[0][0]
        if method == "POST" and "/payments" in call[0][1] and "/cancel" not in call[0][1]:
            json_data = call.kwargs.get("json") or call[1].get("json", {})
            assert json_data["confirmation"]["return_url"] == "https://custom.url/done"
            break
    else:
        pytest.fail("POST /payments call not found")


@pytest.mark.asyncio
async def test_create_payment_metadata(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
    test_seller: Seller,
):
    """Payment metadata includes order_id and seller_id."""
    from backend.app.services.payment import PaymentService

    test_seller.yookassa_oauth_token = "test_oauth_token"
    await test_session.commit()

    new_payment_data = {
        "id": "pay_meta",
        "status": "pending",
        "confirmation": {"confirmation_url": "https://yoomoney.ru/checkout/pay_meta"},
        "amount": {"value": "200.00", "currency": "RUB"},
    }
    resp = _mock_httpx_response(new_payment_data)
    patcher, mock_client = _httpx_patch(resp)

    with patcher:
        service = PaymentService(test_session)
        await service.create_payment(payment_order.id)

    # Find POST /payments call
    for call in mock_client.request.call_args_list:
        method = call[0][0]
        if method == "POST" and "/payments" in call[0][1] and "/cancel" not in call[0][1]:
            json_data = call.kwargs.get("json") or call[1].get("json", {})
            assert json_data["metadata"]["order_id"] == str(payment_order.id)
            assert json_data["metadata"]["seller_id"] == str(payment_order.seller_id)
            break
    else:
        pytest.fail("POST /payments call not found")


# ============================================
# handle_webhook
# ============================================

@pytest.mark.asyncio
async def test_webhook_updates_payment_status(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
):
    """Webhook updates order.payment_status and payment_id."""
    from backend.app.services.payment import PaymentService

    payment_order.payment_id = "pay_wh_123"
    payment_order.payment_status = "pending"
    await test_session.commit()

    service = PaymentService(test_session)

    # Patch the lazy import inside handle_webhook (imported from telegram_notify module)
    with patch(
        "backend.app.services.telegram_notify.notify_buyer_payment_succeeded",
        new_callable=AsyncMock,
    ), patch(
        "backend.app.services.telegram_notify.notify_seller_payment_received",
        new_callable=AsyncMock,
    ), patch(
        "backend.app.services.telegram_notify.resolve_notification_chat_id",
        new_callable=AsyncMock,
        return_value=payment_order.seller_id,
    ), patch(
        "backend.app.services.commissions.record_commission",
        new_callable=AsyncMock,
    ):
        await service.handle_webhook({
            "event": "payment.succeeded",
            "object": {
                "id": "pay_wh_123",
                "status": "succeeded",
                "metadata": {"order_id": str(payment_order.id)},
            },
        })

    # Webhook doesn't commit — flush to persist in-memory changes, then refresh
    await test_session.flush()
    await test_session.refresh(payment_order)
    assert payment_order.payment_status == "succeeded"


@pytest.mark.asyncio
async def test_webhook_ignores_missing_data(
    test_session: AsyncSession,
    mock_yookassa_configured,
):
    """Webhook silently returns if payment_id or order_id missing."""
    from backend.app.services.payment import PaymentService

    service = PaymentService(test_session)

    # Missing payment_id
    await service.handle_webhook({"event": "payment.succeeded", "object": {}})

    # Missing order_id in metadata
    await service.handle_webhook({
        "event": "payment.succeeded",
        "object": {"id": "pay_x", "status": "succeeded", "metadata": {}},
    })


@pytest.mark.asyncio
async def test_webhook_ignores_invalid_order_id(
    test_session: AsyncSession,
    mock_yookassa_configured,
):
    """Webhook silently returns for non-numeric order_id."""
    from backend.app.services.payment import PaymentService

    service = PaymentService(test_session)
    await service.handle_webhook({
        "event": "payment.succeeded",
        "object": {
            "id": "pay_x",
            "status": "succeeded",
            "metadata": {"order_id": "not_a_number"},
        },
    })


@pytest.mark.asyncio
async def test_webhook_ignores_nonexistent_order(
    test_session: AsyncSession,
    mock_yookassa_configured,
):
    """Webhook silently returns when order not found."""
    from backend.app.services.payment import PaymentService

    service = PaymentService(test_session)
    await service.handle_webhook({
        "event": "payment.succeeded",
        "object": {
            "id": "pay_x",
            "status": "succeeded",
            "metadata": {"order_id": "99999"},
        },
    })


@pytest.mark.asyncio
async def test_webhook_payment_id_mismatch(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
):
    """Webhook silently returns when payment_id doesn't match order."""
    from backend.app.services.payment import PaymentService

    payment_order.payment_id = "pay_original"
    payment_order.payment_status = "pending"
    await test_session.commit()

    service = PaymentService(test_session)
    await service.handle_webhook({
        "event": "payment.succeeded",
        "object": {
            "id": "pay_different",
            "status": "succeeded",
            "metadata": {"order_id": str(payment_order.id)},
        },
    })

    await test_session.refresh(payment_order)
    # Status should NOT have changed
    assert payment_order.payment_status == "pending"


@pytest.mark.asyncio
async def test_webhook_auto_refund_on_cancelled_order(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
    test_seller: Seller,
):
    """Webhook triggers auto-refund when payment succeeds but order is cancelled."""
    from backend.app.services.payment import PaymentService

    test_seller.yookassa_oauth_token = "test_oauth_token"
    payment_order.payment_id = "pay_race"
    payment_order.status = "cancelled"
    payment_order.payment_status = "pending"
    await test_session.commit()

    refund_data = _make_yoo_refund_dict(refund_id="ref_auto")
    resp = _mock_httpx_response(refund_data)
    patcher, mock_client = _httpx_patch(resp)

    service = PaymentService(test_session)
    with patcher:
        await service.handle_webhook({
            "event": "payment.succeeded",
            "object": {
                "id": "pay_race",
                "status": "succeeded",
                "metadata": {"order_id": str(payment_order.id)},
            },
        })

    # Flush in-memory changes (webhook doesn't commit), then verify
    await test_session.flush()
    await test_session.refresh(payment_order)
    # Payment status should be updated
    assert payment_order.payment_status == "succeeded"
    # Refund API should have been called (POST /refunds)
    assert mock_client.request.call_count >= 1
    post_calls = [c for c in mock_client.request.call_args_list if c[0][0] == "POST"]
    assert len(post_calls) >= 1


@pytest.mark.asyncio
async def test_webhook_auto_refund_on_rejected_order(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
    test_seller: Seller,
):
    """Webhook triggers auto-refund when payment succeeds but order is rejected."""
    from backend.app.services.payment import PaymentService

    test_seller.yookassa_oauth_token = "test_oauth_token"
    payment_order.payment_id = "pay_race2"
    payment_order.status = "rejected"
    payment_order.payment_status = "pending"
    await test_session.commit()

    refund_data = _make_yoo_refund_dict(refund_id="ref_auto2")
    resp = _mock_httpx_response(refund_data)
    patcher, mock_client = _httpx_patch(resp)

    service = PaymentService(test_session)
    with patcher:
        await service.handle_webhook({
            "event": "payment.succeeded",
            "object": {
                "id": "pay_race2",
                "status": "succeeded",
                "metadata": {"order_id": str(payment_order.id)},
            },
        })

    # Refund API should have been called
    post_calls = [c for c in mock_client.request.call_args_list if c[0][0] == "POST"]
    assert len(post_calls) >= 1


@pytest.mark.asyncio
async def test_webhook_notification_failure_non_critical(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
):
    """Notification failure during webhook doesn't break payment processing."""
    from backend.app.services.payment import PaymentService

    payment_order.payment_id = "pay_notif"
    payment_order.payment_status = "pending"
    await test_session.commit()

    service = PaymentService(test_session)
    # Notifications will fail because telegram_notify can't connect — that's OK
    with patch(
        "backend.app.services.telegram_notify.notify_buyer_payment_succeeded",
        side_effect=Exception("Bot unreachable"),
    ), patch(
        "backend.app.services.telegram_notify.notify_seller_payment_received",
        side_effect=Exception("Bot unreachable"),
    ), patch(
        "backend.app.services.telegram_notify.resolve_notification_chat_id",
        side_effect=Exception("Bot unreachable"),
    ), patch(
        "backend.app.services.commissions.record_commission",
        new_callable=AsyncMock,
    ):
        # Should not raise
        await service.handle_webhook({
            "event": "payment.succeeded",
            "object": {
                "id": "pay_notif",
                "status": "succeeded",
                "metadata": {"order_id": str(payment_order.id)},
            },
        })

    # Flush in-memory changes, then verify
    await test_session.flush()
    await test_session.refresh(payment_order)
    assert payment_order.payment_status == "succeeded"


# ============================================
# get_payment_status
# ============================================

@pytest.mark.asyncio
async def test_get_payment_status_no_payment(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
):
    """get_payment_status returns null fields when order has no payment."""
    from backend.app.services.payment import PaymentService

    service = PaymentService(test_session)
    result = await service.get_payment_status(payment_order.id)

    assert result["payment_id"] is None
    assert result["payment_status"] is None
    assert result["paid"] is False


@pytest.mark.asyncio
async def test_get_payment_status_fresh(
    test_session: AsyncSession,
    mock_yookassa_configured,
    paid_order: Order,
    test_seller: Seller,
):
    """get_payment_status fetches fresh status from YooKassa via seller OAuth."""
    from backend.app.services.payment import PaymentService

    test_seller.yookassa_oauth_token = "test_oauth_token"
    await test_session.commit()

    payment_data = _make_yoo_payment_dict(
        payment_id="pay_existing_123",
        status="succeeded",
        paid=True,
        amount_value="200.00",
    )
    resp = _mock_httpx_response(payment_data)
    patcher, mock_client = _httpx_patch(resp)

    with patcher:
        service = PaymentService(test_session)
        result = await service.get_payment_status(paid_order.id)

    assert result["payment_id"] == "pay_existing_123"
    assert result["payment_status"] == "succeeded"
    assert result["paid"] is True
    assert result["amount"] == "200.00"


@pytest.mark.asyncio
async def test_get_payment_status_api_failure_fallback(
    test_session: AsyncSession,
    mock_yookassa_configured,
    paid_order: Order,
    test_seller: Seller,
):
    """get_payment_status falls back to cached status when YooKassa API fails."""
    from backend.app.services.payment import PaymentService

    test_seller.yookassa_oauth_token = "test_oauth_token"
    await test_session.commit()

    error_resp = _mock_httpx_response({"type": "error"}, status_code=500)
    patcher, _ = _httpx_patch(error_resp)

    with patcher:
        service = PaymentService(test_session)
        result = await service.get_payment_status(paid_order.id)

    # Should return cached values (the API call raises PaymentServiceError internally)
    assert result["payment_id"] == "pay_existing_123"
    assert result["payment_status"] == "succeeded"
    assert result["paid"] is True


@pytest.mark.asyncio
async def test_get_payment_status_no_oauth_token_fallback(
    test_session: AsyncSession,
    mock_yookassa_configured,
    paid_order: Order,
    test_seller: Seller,
):
    """get_payment_status falls back to cached status when seller has no OAuth token."""
    from backend.app.services.payment import PaymentService

    # Ensure seller has NO OAuth token
    test_seller.yookassa_oauth_token = None
    await test_session.commit()

    service = PaymentService(test_session)
    result = await service.get_payment_status(paid_order.id)

    # Should return cached values without making any API call
    assert result["payment_id"] == "pay_existing_123"
    assert result["payment_status"] == "succeeded"
    assert result["paid"] is True


@pytest.mark.asyncio
async def test_get_payment_status_order_not_found(
    test_session: AsyncSession,
    mock_yookassa_configured,
):
    """get_payment_status raises 404 for non-existent order."""
    from backend.app.services.payment import PaymentService, PaymentServiceError

    service = PaymentService(test_session)
    with pytest.raises(PaymentServiceError, match="not found") as exc_info:
        await service.get_payment_status(99999)
    assert exc_info.value.status_code == 404


# ============================================
# refund_payment
# ============================================

@pytest.mark.asyncio
async def test_refund_full(
    test_session: AsyncSession,
    mock_yookassa_configured,
    paid_order: Order,
    test_seller: Seller,
):
    """Full refund (amount=None) refunds order's total_price."""
    from backend.app.services.payment import PaymentService

    test_seller.yookassa_oauth_token = "test_oauth_token"
    await test_session.commit()

    refund_data = _make_yoo_refund_dict(refund_id="ref_full", amount_value="200.00")
    resp = _mock_httpx_response(refund_data)
    patcher, mock_client = _httpx_patch(resp)

    with patcher:
        service = PaymentService(test_session)
        result = await service.refund_payment(paid_order.id)

    assert result["refund_id"] == "ref_full"
    assert result["status"] == "succeeded"
    assert result["amount"] == "200.00"

    # Verify refund params sent to API
    call_args = mock_client.request.call_args
    json_data = call_args.kwargs.get("json") or call_args[1].get("json", {})
    assert json_data["payment_id"] == "pay_existing_123"
    assert json_data["amount"]["value"] == "200.00"
    assert json_data["amount"]["currency"] == "RUB"


@pytest.mark.asyncio
async def test_refund_partial(
    test_session: AsyncSession,
    mock_yookassa_configured,
    paid_order: Order,
    test_seller: Seller,
):
    """Partial refund with specific amount."""
    from backend.app.services.payment import PaymentService

    test_seller.yookassa_oauth_token = "test_oauth_token"
    await test_session.commit()

    refund_data = _make_yoo_refund_dict(refund_id="ref_partial", amount_value="50.00")
    resp = _mock_httpx_response(refund_data)
    patcher, mock_client = _httpx_patch(resp)

    with patcher:
        service = PaymentService(test_session)
        result = await service.refund_payment(paid_order.id, amount=Decimal("50.00"))

    assert result["amount"] == "50.00"

    call_args = mock_client.request.call_args
    json_data = call_args.kwargs.get("json") or call_args[1].get("json", {})
    assert json_data["amount"]["value"] == "50.00"


@pytest.mark.asyncio
async def test_refund_no_payment(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
):
    """Refund raises 400 when order has no payment_id."""
    from backend.app.services.payment import PaymentService, PaymentServiceError

    service = PaymentService(test_session)
    with pytest.raises(PaymentServiceError, match="no payment"):
        await service.refund_payment(payment_order.id)


@pytest.mark.asyncio
async def test_refund_non_succeeded_payment(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
):
    """Refund raises 400 when payment_status is not 'succeeded'."""
    from backend.app.services.payment import PaymentService, PaymentServiceError

    payment_order.payment_id = "pay_pending"
    payment_order.payment_status = "pending"
    await test_session.commit()

    service = PaymentService(test_session)
    with pytest.raises(PaymentServiceError, match="Cannot refund"):
        await service.refund_payment(payment_order.id)


@pytest.mark.asyncio
async def test_refund_order_not_found(
    test_session: AsyncSession,
    mock_yookassa_configured,
):
    """Refund raises 404 for non-existent order."""
    from backend.app.services.payment import PaymentService, PaymentServiceError

    service = PaymentService(test_session)
    with pytest.raises(PaymentServiceError, match="not found") as exc_info:
        await service.refund_payment(99999)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_refund_seller_no_oauth_token(
    test_session: AsyncSession,
    mock_yookassa_configured,
    paid_order: Order,
    test_seller: Seller,
):
    """Refund raises 400 when seller has no OAuth token."""
    from backend.app.services.payment import PaymentService, PaymentServiceError

    test_seller.yookassa_oauth_token = None
    await test_session.commit()

    service = PaymentService(test_session)
    with pytest.raises(PaymentServiceError, match="not connected"):
        await service.refund_payment(paid_order.id)


@pytest.mark.asyncio
async def test_refund_api_failure(
    test_session: AsyncSession,
    mock_yookassa_configured,
    paid_order: Order,
    test_seller: Seller,
):
    """Refund raises 502 when YooKassa API fails."""
    from backend.app.services.payment import PaymentService, PaymentServiceError

    test_seller.yookassa_oauth_token = "test_oauth_token"
    await test_session.commit()

    error_resp = _mock_httpx_response({"type": "error"}, status_code=500)
    patcher, _ = _httpx_patch(error_resp)

    with patcher:
        service = PaymentService(test_session)
        with pytest.raises(PaymentServiceError, match="Refund failed") as exc_info:
            await service.refund_payment(paid_order.id)
        assert exc_info.value.status_code == 502


# ============================================
# Exception classes
# ============================================

def test_payment_service_error():
    """PaymentServiceError stores message and status_code."""
    from backend.app.services.payment import PaymentServiceError

    err = PaymentServiceError("Something broke", 502)
    assert str(err) == "Something broke"
    assert err.message == "Something broke"
    assert err.status_code == 502


def test_payment_not_configured_error():
    """PaymentNotConfiguredError has default message and 503 status."""
    from backend.app.services.payment import PaymentNotConfiguredError

    err = PaymentNotConfiguredError()
    assert "not configured" in err.message
    assert err.status_code == 503


def test_seller_not_onboarded_error():
    """SellerNotOnboardedError includes seller_id and 400 status."""
    from backend.app.services.payment import SellerNotOnboardedError

    err = SellerNotOnboardedError(42)
    assert "42" in err.message
    assert err.status_code == 400


# ============================================
# Commission ledger (accumulated commission)
# ============================================

@pytest.mark.asyncio
async def test_commission_recorded_on_webhook_success(
    test_session: AsyncSession,
    mock_yookassa_configured,
    payment_order: Order,
    test_seller: Seller,
):
    """Commission is recorded in ledger when payment webhook reports success."""
    from backend.app.services.payment import PaymentService
    from backend.app.models.commission_ledger import CommissionLedger
    from sqlalchemy import select

    test_seller.yookassa_oauth_token = "test_token"
    test_seller.commission_percent = 5  # 5%
    payment_order.payment_id = "pay_webhook_comm"
    await test_session.commit()

    event_data = {
        "event": "payment.succeeded",
        "object": {
            "id": "pay_webhook_comm",
            "status": "succeeded",
            "metadata": {"order_id": str(payment_order.id)},
        },
    }

    with patch("backend.app.services.telegram_notify.notify_buyer_payment_succeeded", new_callable=AsyncMock), \
         patch("backend.app.services.telegram_notify.notify_seller_payment_received", new_callable=AsyncMock), \
         patch("backend.app.services.telegram_notify.resolve_notification_chat_id", new_callable=AsyncMock, return_value=test_seller.seller_id):
        service = PaymentService(test_session)
        await service.handle_webhook(event_data)
        await test_session.commit()

    # Check commission was recorded
    result = await test_session.execute(
        select(CommissionLedger).where(CommissionLedger.order_id == payment_order.id)
    )
    entry = result.scalar_one_or_none()
    assert entry is not None
    assert float(entry.commission_rate) == 5
    # 5% of 200 = 10.00
    assert float(entry.commission_amount) == 10.00
    assert entry.paid is False


# ============================================
# Auto-refund on cancel/reject (API integration)
# ============================================

@pytest.mark.asyncio
async def test_cancel_paid_order_triggers_refund(
    client,
    test_session: AsyncSession,
    test_user: User,
    test_seller: Seller,
    test_product: Product,
):
    """Cancelling a paid order triggers auto-refund via YooKassa."""
    from backend.tests.conftest import get_auth_header_for_user

    # Set seller's OAuth token so refund can proceed
    test_seller.yookassa_oauth_token = "test_oauth_token"

    # Create a paid accepted order
    order = Order(
        buyer_id=test_user.tg_id,
        seller_id=test_seller.seller_id,
        items_info=f"{test_product.id}:Test Product@100.00 x 2",
        total_price=200.00,
        status="accepted",
        delivery_type="pickup",
        payment_id="pay_cancel_test",
        payment_status="succeeded",
    )
    test_session.add(order)
    test_seller.active_orders += 1
    await test_session.commit()
    await test_session.refresh(order)

    refund_data = _make_yoo_refund_dict(refund_id="ref_cancel")
    resp = _mock_httpx_response(refund_data)

    headers = get_auth_header_for_user(test_user.tg_id)
    patcher, mock_client = _httpx_patch(resp)
    with patcher, \
         patch("backend.app.services.payment.get_settings") as mock_s, \
         patch("backend.app.services.telegram_notify.notify_seller_order_cancelled", new_callable=AsyncMock), \
         patch("backend.app.services.telegram_notify.notify_buyer_payment_refunded", new_callable=AsyncMock) as mock_buyer_notif, \
         patch("backend.app.services.telegram_notify.notify_seller_payment_refunded", new_callable=AsyncMock) as mock_seller_notif:
        settings = MagicMock()
        settings.YOOKASSA_RETURN_URL = "https://test.ru"
        mock_s.return_value = settings

        response = await client.post(
            f"/buyers/me/orders/{order.id}/cancel",
            headers=headers,
        )

    assert response.status_code == 200
    assert response.json()["new_status"] == "cancelled"
    # Refund API should have been called (POST /refunds)
    post_calls = [c for c in mock_client.request.call_args_list if c[0][0] == "POST"]
    assert len(post_calls) >= 1
    # Both notifications should have been sent
    mock_buyer_notif.assert_called_once()
    mock_seller_notif.assert_called_once()


@pytest.mark.asyncio
async def test_cancel_unpaid_order_no_refund(
    client,
    test_session: AsyncSession,
    test_user: User,
    test_seller: Seller,
):
    """Cancelling an unpaid order does NOT trigger refund."""
    from backend.tests.conftest import get_auth_header_for_user

    order = Order(
        buyer_id=test_user.tg_id,
        seller_id=test_seller.seller_id,
        items_info="1:Test x 1",
        total_price=100.00,
        status="pending",
        delivery_type="pickup",
        payment_id=None,
        payment_status=None,
    )
    test_session.add(order)
    test_seller.pending_requests += 1
    await test_session.commit()
    await test_session.refresh(order)

    headers = get_auth_header_for_user(test_user.tg_id)
    patcher, mock_client = _httpx_patch(_mock_httpx_response({}))
    with patcher, \
         patch("backend.app.services.telegram_notify.notify_seller_order_cancelled", new_callable=AsyncMock):
        response = await client.post(
            f"/buyers/me/orders/{order.id}/cancel",
            headers=headers,
        )

    assert response.status_code == 200
    # Refund should NOT have been called — no httpx requests
    mock_client.request.assert_not_called()


@pytest.mark.asyncio
async def test_cancel_pending_payment_no_refund(
    client,
    test_session: AsyncSession,
    test_user: User,
    test_seller: Seller,
):
    """Cancelling an order with pending (not succeeded) payment does NOT trigger refund."""
    from backend.tests.conftest import get_auth_header_for_user

    order = Order(
        buyer_id=test_user.tg_id,
        seller_id=test_seller.seller_id,
        items_info="1:Test x 1",
        total_price=100.00,
        status="pending",
        delivery_type="pickup",
        payment_id="pay_pending",
        payment_status="pending",  # Not yet succeeded
    )
    test_session.add(order)
    test_seller.pending_requests += 1
    await test_session.commit()
    await test_session.refresh(order)

    headers = get_auth_header_for_user(test_user.tg_id)
    patcher, mock_client = _httpx_patch(_mock_httpx_response({}))
    with patcher, \
         patch("backend.app.services.telegram_notify.notify_seller_order_cancelled", new_callable=AsyncMock):
        response = await client.post(
            f"/buyers/me/orders/{order.id}/cancel",
            headers=headers,
        )

    assert response.status_code == 200
    # Refund should NOT have been called — payment hasn't succeeded
    mock_client.request.assert_not_called()


@pytest.mark.asyncio
async def test_refund_failure_doesnt_block_cancel(
    client,
    test_session: AsyncSession,
    test_user: User,
    test_seller: Seller,
):
    """If refund fails, the order cancellation still succeeds."""
    from backend.tests.conftest import get_auth_header_for_user

    # Set seller's OAuth token so refund path is attempted
    test_seller.yookassa_oauth_token = "test_oauth_token"

    order = Order(
        buyer_id=test_user.tg_id,
        seller_id=test_seller.seller_id,
        items_info="1:Test@100.00 x 1",
        total_price=100.00,
        status="accepted",
        delivery_type="pickup",
        payment_id="pay_fail_refund",
        payment_status="succeeded",
    )
    test_session.add(order)
    test_seller.active_orders += 1
    await test_session.commit()
    await test_session.refresh(order)

    # Simulate YooKassa API failure (500 error)
    error_resp = _mock_httpx_response({"type": "error"}, status_code=500)
    patcher, _ = _httpx_patch(error_resp)

    headers = get_auth_header_for_user(test_user.tg_id)
    with patcher, \
         patch("backend.app.services.payment.get_settings") as mock_s, \
         patch("backend.app.services.telegram_notify.notify_seller_order_cancelled", new_callable=AsyncMock):
        settings = MagicMock()
        settings.YOOKASSA_RETURN_URL = "https://test.ru"
        mock_s.return_value = settings

        response = await client.post(
            f"/buyers/me/orders/{order.id}/cancel",
            headers=headers,
        )

    # Order should still be cancelled despite refund failure
    assert response.status_code == 200
    assert response.json()["new_status"] == "cancelled"
