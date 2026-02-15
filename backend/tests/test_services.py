"""
Unit tests for backend services.

Tests cover:
- BuyerService (registration, profile updates, balance operations)
- CartService (add/remove items, checkout)
- LoyaltyService (customer CRUD, points accrual/deduction)
- Password utilities (hashing, verification, validation)
- Phone normalization
- Referral commissions calculation
"""
import pytest
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.user import User
from backend.app.models.seller import Seller
from backend.app.models.product import Product
from backend.app.models.order import Order
from backend.app.models.cart import CartItem
from backend.app.models.loyalty import SellerCustomer, normalize_phone


# ============================================
# BUYER SERVICE
# ============================================

@pytest.mark.asyncio
async def test_buyer_service_get_buyer(test_session: AsyncSession, test_user: User):
    """Test BuyerService.get_buyer finds existing user."""
    from backend.app.services.buyers import BuyerService
    service = BuyerService(test_session)
    user = await service.get_buyer(test_user.tg_id)
    assert user is not None
    assert user.tg_id == test_user.tg_id


@pytest.mark.asyncio
async def test_buyer_service_get_buyer_not_found(test_session: AsyncSession):
    """Test BuyerService.get_buyer returns None for non-existent user."""
    from backend.app.services.buyers import BuyerService
    service = BuyerService(test_session)
    user = await service.get_buyer(999999999)
    assert user is None


@pytest.mark.asyncio
async def test_buyer_service_get_buyer_info(test_session: AsyncSession, test_user: User):
    """Test BuyerService.get_buyer_info returns dict."""
    from backend.app.services.buyers import BuyerService
    service = BuyerService(test_session)
    info = await service.get_buyer_info(test_user.tg_id)
    assert info is not None
    assert info["tg_id"] == test_user.tg_id
    assert "role" in info
    assert "balance" in info


@pytest.mark.asyncio
async def test_buyer_service_register_new(test_session: AsyncSession):
    """Test BuyerService.register_buyer creates new user."""
    from backend.app.services.buyers import BuyerService
    service = BuyerService(test_session)
    user = await service.register_buyer(
        tg_id=444444444,
        username="newuser",
        fio="New User",
    )
    assert user.tg_id == 444444444
    assert user.role == "BUYER"


@pytest.mark.asyncio
async def test_buyer_service_register_existing(test_session: AsyncSession, test_user: User):
    """Test BuyerService.register_buyer returns existing user without changes."""
    from backend.app.services.buyers import BuyerService
    service = BuyerService(test_session)
    user = await service.register_buyer(
        tg_id=test_user.tg_id,
        username="different_name",
        fio="Different FIO",
    )
    assert user.tg_id == test_user.tg_id
    # Original username should be unchanged
    assert user.username == test_user.username


@pytest.mark.asyncio
async def test_buyer_service_update_profile(test_session: AsyncSession, test_user: User):
    """Test BuyerService.update_profile updates allowed fields."""
    from backend.app.services.buyers import BuyerService
    service = BuyerService(test_session)
    result = await service.update_profile(
        tg_id=test_user.tg_id,
        fio="Updated FIO",
        phone="+79001234567",
    )
    assert result["fio"] == "Updated FIO"


@pytest.mark.asyncio
async def test_buyer_service_update_profile_not_found(test_session: AsyncSession):
    """Test BuyerService.update_profile raises error for non-existent user."""
    from backend.app.services.buyers import BuyerService, UserNotFoundError
    service = BuyerService(test_session)
    with pytest.raises(UserNotFoundError):
        await service.update_profile(tg_id=999999999, fio="Test")


@pytest.mark.asyncio
async def test_buyer_service_get_balance(test_session: AsyncSession, test_user: User):
    """Test BuyerService.get_balance returns 0 for new user."""
    from backend.app.services.buyers import BuyerService
    service = BuyerService(test_session)
    balance = await service.get_balance(test_user.tg_id)
    assert balance == 0.0


@pytest.mark.asyncio
async def test_buyer_service_update_balance_add(test_session: AsyncSession, test_user: User):
    """Test BuyerService.update_balance add operation."""
    from backend.app.services.buyers import BuyerService
    service = BuyerService(test_session)
    new_balance = await service.update_balance(test_user.tg_id, 100.0, "add")
    assert new_balance == 100.0


@pytest.mark.asyncio
async def test_buyer_service_update_balance_subtract(test_session: AsyncSession, test_user: User):
    """Test BuyerService.update_balance subtract operation."""
    from backend.app.services.buyers import BuyerService
    service = BuyerService(test_session)
    # Add first, then subtract
    await service.update_balance(test_user.tg_id, 100.0, "add")
    new_balance = await service.update_balance(test_user.tg_id, 30.0, "subtract")
    assert new_balance == 70.0


@pytest.mark.asyncio
async def test_buyer_service_update_balance_insufficient_funds(test_session: AsyncSession, test_user: User):
    """Test BuyerService.update_balance fails on insufficient funds."""
    from backend.app.services.buyers import BuyerService, BuyerServiceError
    service = BuyerService(test_session)
    with pytest.raises(BuyerServiceError, match="Insufficient"):
        await service.update_balance(test_user.tg_id, 1000.0, "subtract")


@pytest.mark.asyncio
async def test_buyer_service_update_balance_set(test_session: AsyncSession, test_user: User):
    """Test BuyerService.update_balance set operation."""
    from backend.app.services.buyers import BuyerService
    service = BuyerService(test_session)
    new_balance = await service.update_balance(test_user.tg_id, 500.0, "set")
    assert new_balance == 500.0


@pytest.mark.asyncio
async def test_buyer_service_update_balance_invalid_operation(test_session: AsyncSession, test_user: User):
    """Test BuyerService.update_balance with invalid operation."""
    from backend.app.services.buyers import BuyerService, BuyerServiceError
    service = BuyerService(test_session)
    with pytest.raises(BuyerServiceError, match="Invalid operation"):
        await service.update_balance(test_user.tg_id, 100.0, "multiply")


# ============================================
# PHONE NORMALIZATION (loyalty model)
# ============================================

class TestNormalizePhone:
    """Test phone normalization for loyalty matching."""

    def test_normalize_phone_with_plus7(self):
        assert normalize_phone("+79001234567") == "79001234567"

    def test_normalize_phone_with_8(self):
        # 89001234567 -> 11 digits starting with 8, not 7
        result = normalize_phone("89001234567")
        # Returns as-is since first digit is 8, not 7
        assert result == "89001234567"

    def test_normalize_phone_10_digits(self):
        # 10-digit phone starting with 9 gets prefix 7
        assert normalize_phone("9001234567") == "79001234567"

    def test_normalize_phone_with_spaces(self):
        assert normalize_phone("+7 900 123 45 67") == "79001234567"

    def test_normalize_phone_with_dashes(self):
        assert normalize_phone("+7-900-123-45-67") == "79001234567"

    def test_normalize_phone_empty(self):
        assert normalize_phone("") == ""

    def test_normalize_phone_short(self):
        result = normalize_phone("123")
        assert result == "123"


# ============================================
# PASSWORD UTILITIES
# ============================================

class TestPasswordUtils:
    """Test password hashing and verification."""

    def test_hash_password(self):
        from backend.app.core.password_utils import hash_password
        hashed = hash_password("testpassword")
        assert hashed is not None
        assert hashed != "testpassword"
        assert hashed.startswith("$2")  # bcrypt prefix

    def test_verify_password_correct(self):
        from backend.app.core.password_utils import hash_password, verify_password
        hashed = hash_password("testpassword")
        assert verify_password("testpassword", hashed) is True

    def test_verify_password_wrong(self):
        from backend.app.core.password_utils import hash_password, verify_password
        hashed = hash_password("testpassword")
        assert verify_password("wrongpassword", hashed) is False

    def test_verify_password_invalid_hash(self):
        from backend.app.core.password_utils import verify_password
        assert verify_password("testpassword", "not_a_hash") is False


class TestPasswordValidation:
    """Test password strength validation."""

    def test_valid_password(self):
        from backend.app.core.password_validation import validate_password_strength
        is_valid, errors = validate_password_strength("TestPass1")
        assert is_valid is True
        assert len(errors) == 0

    def test_password_too_short(self):
        from backend.app.core.password_validation import validate_password_strength
        is_valid, errors = validate_password_strength("Ab1")
        assert is_valid is False
        assert any("8" in e or "минимум" in e.lower() for e in errors)

    def test_password_no_uppercase(self):
        from backend.app.core.password_validation import validate_password_strength
        is_valid, errors = validate_password_strength("testpass1")
        assert is_valid is False

    def test_password_no_lowercase(self):
        from backend.app.core.password_validation import validate_password_strength
        is_valid, errors = validate_password_strength("TESTPASS1")
        assert is_valid is False

    def test_password_no_digit(self):
        from backend.app.core.password_validation import validate_password_strength
        is_valid, errors = validate_password_strength("TestPassword")
        assert is_valid is False

    def test_password_cyrillic(self):
        """Test that Cyrillic letters are accepted."""
        from backend.app.core.password_validation import validate_password_strength
        is_valid, errors = validate_password_strength("ТестПароль1")
        assert is_valid is True

    def test_password_too_long(self):
        from backend.app.core.password_validation import validate_password_strength
        is_valid, errors = validate_password_strength("A" * 129 + "a1")
        assert is_valid is False


class TestSanitizeInput:
    """Test XSS sanitization."""

    def test_sanitize_normal_text(self):
        from backend.app.core.password_validation import sanitize_user_input
        assert sanitize_user_input("Hello World") == "Hello World"

    def test_sanitize_truncation(self):
        from backend.app.core.password_validation import sanitize_user_input
        long_text = "A" * 200
        result = sanitize_user_input(long_text, max_length=100)
        assert len(result) == 100

    def test_sanitize_null_bytes(self):
        from backend.app.core.password_validation import sanitize_user_input
        result = sanitize_user_input("Hello\x00World")
        assert "\x00" not in result


# ============================================
# LOYALTY SERVICE
# ============================================

@pytest.mark.asyncio
async def test_loyalty_service_get_points_percent(test_session: AsyncSession, test_seller: Seller):
    """Test getting loyalty points percentage."""
    from backend.app.services.loyalty import LoyaltyService
    service = LoyaltyService(test_session)
    percent = await service.get_points_percent(test_seller.seller_id)
    assert isinstance(percent, (int, float))
    assert percent >= 0


@pytest.mark.asyncio
async def test_loyalty_service_set_points_percent(test_session: AsyncSession, test_seller: Seller):
    """Test setting loyalty points percentage."""
    from backend.app.services.loyalty import LoyaltyService
    service = LoyaltyService(test_session)
    await service.set_points_percent(test_seller.seller_id, 5.0)
    await test_session.commit()
    percent = await service.get_points_percent(test_seller.seller_id)
    assert percent == 5.0


@pytest.mark.asyncio
async def test_loyalty_service_create_customer(test_session: AsyncSession, test_seller: Seller):
    """Test creating a loyalty customer."""
    from backend.app.services.loyalty import LoyaltyService
    service = LoyaltyService(test_session)
    customer = await service.create_customer(
        seller_id=test_seller.seller_id,
        phone="+79001234567",
        first_name="Иван",
        last_name="Петров",
    )
    await test_session.commit()
    assert customer["phone"] is not None
    assert customer["first_name"] == "Иван"
    assert customer["card_number"] is not None


@pytest.mark.asyncio
async def test_loyalty_service_create_customer_duplicate_phone(test_session: AsyncSession, test_seller: Seller):
    """Test creating customer with duplicate phone."""
    from backend.app.services.loyalty import LoyaltyService, DuplicatePhoneError
    service = LoyaltyService(test_session)
    await service.create_customer(
        seller_id=test_seller.seller_id,
        phone="+79005555555",
        first_name="First",
        last_name="Customer",
    )
    await test_session.commit()

    with pytest.raises(DuplicatePhoneError):
        await service.create_customer(
            seller_id=test_seller.seller_id,
            phone="+79005555555",
            first_name="Second",
            last_name="Customer",
        )


@pytest.mark.asyncio
async def test_loyalty_service_list_customers(test_session: AsyncSession, test_seller: Seller):
    """Test listing loyalty customers."""
    from backend.app.services.loyalty import LoyaltyService
    service = LoyaltyService(test_session)
    customers = await service.list_customers(test_seller.seller_id)
    assert isinstance(customers, list)


@pytest.mark.asyncio
async def test_loyalty_service_get_customer(test_session: AsyncSession, test_seller: Seller):
    """Test getting a specific customer."""
    from backend.app.services.loyalty import LoyaltyService
    service = LoyaltyService(test_session)
    created = await service.create_customer(
        seller_id=test_seller.seller_id,
        phone="+79006666666",
        first_name="Test",
        last_name="Customer",
    )
    await test_session.commit()

    customer = await service.get_customer(created["id"], test_seller.seller_id)
    assert customer is not None
    assert customer["id"] == created["id"]


@pytest.mark.asyncio
async def test_loyalty_service_get_customer_not_found(test_session: AsyncSession, test_seller: Seller):
    """Test getting non-existent customer."""
    from backend.app.services.loyalty import LoyaltyService
    service = LoyaltyService(test_session)
    customer = await service.get_customer(999999, test_seller.seller_id)
    assert customer is None


@pytest.mark.asyncio
async def test_loyalty_service_find_by_phone(test_session: AsyncSession, test_seller: Seller):
    """Test finding customer by phone."""
    from backend.app.services.loyalty import LoyaltyService
    service = LoyaltyService(test_session)
    await service.create_customer(
        seller_id=test_seller.seller_id,
        phone="+79007777777",
        first_name="Phone",
        last_name="Search",
    )
    await test_session.commit()

    found = await service.find_customer_by_phone(test_seller.seller_id, "+79007777777")
    assert found is not None


@pytest.mark.asyncio
async def test_loyalty_service_accrue_points(test_session: AsyncSession, test_seller: Seller):
    """Test accruing loyalty points."""
    from backend.app.services.loyalty import LoyaltyService
    service = LoyaltyService(test_session)

    # Set points percent first
    await service.set_points_percent(test_seller.seller_id, 10.0)

    created = await service.create_customer(
        seller_id=test_seller.seller_id,
        phone="+79008888888",
        first_name="Points",
        last_name="Buyer",
    )
    await test_session.commit()

    result = await service.accrue_points(
        seller_id=test_seller.seller_id,
        customer_id=created["id"],
        amount=1000.0,
    )
    await test_session.commit()
    assert result["points_accrued"] == 100.0  # 10% of 1000


@pytest.mark.asyncio
async def test_loyalty_service_update_customer(test_session: AsyncSession, test_seller: Seller):
    """Test updating customer notes and tags."""
    from backend.app.services.loyalty import LoyaltyService
    service = LoyaltyService(test_session)
    created = await service.create_customer(
        seller_id=test_seller.seller_id,
        phone="+79009999999",
        first_name="Update",
        last_name="Test",
    )
    await test_session.commit()

    result = await service.update_customer(
        seller_id=test_seller.seller_id,
        customer_id=created["id"],
        notes="VIP клиент",
        tags="vip,premium",
    )
    await test_session.commit()
    assert result is not None


# ============================================
# REFERRAL COMMISSIONS
# ============================================

@pytest.mark.asyncio
async def test_calculate_rewards_no_referrer(test_session, test_user: User):
    """Test referral rewards calculation returns empty when no referrer."""
    from backend.app.services.referrals import calculate_rewards
    rewards = await calculate_rewards(test_session, 1000.0, test_user.tg_id)
    assert isinstance(rewards, list)
    assert len(rewards) == 0  # No referrer → no rewards


@pytest.mark.asyncio
async def test_accrue_commissions_no_referrer(test_session, test_user: User):
    """Test accrue_commissions returns empty when no referrer."""
    from backend.app.services.referrals import accrue_commissions
    result = await accrue_commissions(test_session, 1000.0, test_user.tg_id)
    assert isinstance(result, list)
    assert len(result) == 0


# ============================================
# INN VALIDATOR (Pydantic schema)
# ============================================

class TestINNValidation:
    """Test INN format validation in admin schemas."""

    def test_valid_inn_10_digits(self):
        from backend.app.api.admin import SellerCreateSchema
        schema = SellerCreateSchema(
            fio="Test", phone="+7900", shop_name="Shop",
            delivery_type="both", inn="1234567890",
        )
        assert schema.inn == "1234567890"

    def test_valid_inn_12_digits(self):
        from backend.app.api.admin import SellerCreateSchema
        schema = SellerCreateSchema(
            fio="Test", phone="+7900", shop_name="Shop",
            delivery_type="both", inn="123456789012",
        )
        assert schema.inn == "123456789012"

    def test_invalid_inn_wrong_length(self):
        from backend.app.api.admin import SellerCreateSchema
        with pytest.raises(Exception):
            SellerCreateSchema(
                fio="Test", phone="+7900", shop_name="Shop",
                delivery_type="both", inn="12345",
            )

    def test_invalid_inn_non_digits(self):
        from backend.app.api.admin import SellerCreateSchema
        with pytest.raises(Exception):
            SellerCreateSchema(
                fio="Test", phone="+7900", shop_name="Shop",
                delivery_type="both", inn="123abc7890",
            )

    def test_inn_none_allowed(self):
        from backend.app.api.admin import SellerCreateSchema
        schema = SellerCreateSchema(
            fio="Test", phone="+7900", shop_name="Shop",
            delivery_type="both", inn=None,
        )
        assert schema.inn is None

    def test_inn_empty_string_normalized(self):
        from backend.app.api.admin import SellerCreateSchema
        schema = SellerCreateSchema(
            fio="Test", phone="+7900", shop_name="Shop",
            delivery_type="both", inn="",
        )
        assert schema.inn is None

    def test_inn_with_spaces(self):
        from backend.app.api.admin import SellerCreateSchema
        schema = SellerCreateSchema(
            fio="Test", phone="+7900", shop_name="Shop",
            delivery_type="both", inn=" 1234567890 ",
        )
        assert schema.inn == "1234567890"
