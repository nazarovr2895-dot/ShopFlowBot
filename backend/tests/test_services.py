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


# ============================================
# OGRN VALIDATOR (Pydantic schema)
# ============================================

class TestOGRNValidation:
    """Test OGRN format validation in admin schemas."""

    def test_valid_ogrn_13_digits(self):
        from backend.app.api.admin import SellerCreateSchema
        schema = SellerCreateSchema(
            fio="Test", phone="+7900", shop_name="Shop",
            delivery_type="both", ogrn="1234567890123",
        )
        assert schema.ogrn == "1234567890123"

    def test_valid_ogrn_15_digits(self):
        from backend.app.api.admin import SellerCreateSchema
        schema = SellerCreateSchema(
            fio="Test", phone="+7900", shop_name="Shop",
            delivery_type="both", ogrn="123456789012345",
        )
        assert schema.ogrn == "123456789012345"

    def test_invalid_ogrn_wrong_length(self):
        from backend.app.api.admin import SellerCreateSchema
        with pytest.raises(Exception):
            SellerCreateSchema(
                fio="Test", phone="+7900", shop_name="Shop",
                delivery_type="both", ogrn="12345",
            )

    def test_invalid_ogrn_14_digits(self):
        from backend.app.api.admin import SellerCreateSchema
        with pytest.raises(Exception):
            SellerCreateSchema(
                fio="Test", phone="+7900", shop_name="Shop",
                delivery_type="both", ogrn="12345678901234",
            )

    def test_invalid_ogrn_non_digits(self):
        from backend.app.api.admin import SellerCreateSchema
        with pytest.raises(Exception):
            SellerCreateSchema(
                fio="Test", phone="+7900", shop_name="Shop",
                delivery_type="both", ogrn="123abc7890123",
            )

    def test_ogrn_none_allowed(self):
        from backend.app.api.admin import SellerCreateSchema
        schema = SellerCreateSchema(
            fio="Test", phone="+7900", shop_name="Shop",
            delivery_type="both", ogrn=None,
        )
        assert schema.ogrn is None

    def test_ogrn_empty_string_normalized(self):
        from backend.app.api.admin import SellerCreateSchema
        schema = SellerCreateSchema(
            fio="Test", phone="+7900", shop_name="Shop",
            delivery_type="both", ogrn="",
        )
        assert schema.ogrn is None

    def test_ogrn_with_spaces(self):
        from backend.app.api.admin import SellerCreateSchema
        schema = SellerCreateSchema(
            fio="Test", phone="+7900", shop_name="Shop",
            delivery_type="both", ogrn=" 1234567890123 ",
        )
        assert schema.ogrn == "1234567890123"


# ============================================
# _extract_fio HELPER
# ============================================

class TestExtractFio:
    """Test _extract_fio helper for extracting person name from DaData org data."""

    def test_extract_fio_legal_entity(self):
        """LEGAL type: FIO from management.name."""
        from backend.app.api.admin import _extract_fio
        org_data = {
            "type": "LEGAL",
            "management": {"name": "Иванов Иван Иванович", "post": "Генеральный директор"},
        }
        assert _extract_fio(org_data) == "Иванов Иван Иванович"

    def test_extract_fio_individual(self):
        """INDIVIDUAL (ИП) type: FIO from fio object."""
        from backend.app.api.admin import _extract_fio
        org_data = {
            "type": "INDIVIDUAL",
            "fio": {"surname": "Петрова", "name": "Мария", "patronymic": "Сергеевна"},
        }
        assert _extract_fio(org_data) == "Петрова Мария Сергеевна"

    def test_extract_fio_individual_no_patronymic(self):
        """INDIVIDUAL with no patronymic."""
        from backend.app.api.admin import _extract_fio
        org_data = {
            "type": "INDIVIDUAL",
            "fio": {"surname": "Ким", "name": "Алексей", "patronymic": None},
        }
        assert _extract_fio(org_data) == "Ким Алексей"

    def test_extract_fio_no_data(self):
        """No management and no fio — returns None."""
        from backend.app.api.admin import _extract_fio
        org_data = {"type": "LEGAL"}
        assert _extract_fio(org_data) is None

    def test_extract_fio_empty_management(self):
        """Management exists but name is empty."""
        from backend.app.api.admin import _extract_fio
        org_data = {"management": {"name": "", "post": "Директор"}}
        assert _extract_fio(org_data) is None

    def test_extract_fio_management_none_name(self):
        """Management exists but name is None."""
        from backend.app.api.admin import _extract_fio
        org_data = {"management": {"name": None}}
        assert _extract_fio(org_data) is None

    def test_extract_fio_prefers_management_over_fio(self):
        """When both management and fio exist, management takes priority."""
        from backend.app.api.admin import _extract_fio
        org_data = {
            "management": {"name": "Сидоров Пётр Иванович"},
            "fio": {"surname": "Другой", "name": "Человек", "patronymic": "Отчество"},
        }
        assert _extract_fio(org_data) == "Сидоров Пётр Иванович"

    def test_extract_fio_empty_fio_fields(self):
        """fio object with all empty fields — returns None."""
        from backend.app.api.admin import _extract_fio
        org_data = {
            "fio": {"surname": None, "name": None, "patronymic": None},
        }
        assert _extract_fio(org_data) is None


# ============================================
# DaData INN/OGRN FORMAT VALIDATION (service)
# ============================================

class TestDadataFormatValidation:
    """Test DaData validate_inn format checks (no HTTP calls).

    Note: validate_inn checks API key first. When DADATA_API_KEY is not set,
    it returns None without validating format. We temporarily set a dummy key
    on the settings singleton to test format validation.
    """

    @pytest.mark.asyncio
    async def test_invalid_format_short(self):
        """Too short identifier raises ValueError."""
        from backend.app.core.settings import get_settings
        from backend.app.services.dadata import validate_inn
        settings = get_settings()
        original = settings.DADATA_API_KEY
        settings.DADATA_API_KEY = "dummy_key_for_test"
        try:
            with pytest.raises(ValueError, match="ИНН.*ОГРН"):
                await validate_inn("12345")
        finally:
            settings.DADATA_API_KEY = original

    @pytest.mark.asyncio
    async def test_invalid_format_non_digits(self):
        """Non-digit identifier raises ValueError."""
        from backend.app.core.settings import get_settings
        from backend.app.services.dadata import validate_inn
        settings = get_settings()
        original = settings.DADATA_API_KEY
        settings.DADATA_API_KEY = "dummy_key_for_test"
        try:
            with pytest.raises(ValueError, match="ИНН.*ОГРН"):
                await validate_inn("abcdefghij")
        finally:
            settings.DADATA_API_KEY = original

    @pytest.mark.asyncio
    async def test_invalid_format_11_digits(self):
        """11-digit identifier raises ValueError (not 10/12/13/15)."""
        from backend.app.core.settings import get_settings
        from backend.app.services.dadata import validate_inn
        settings = get_settings()
        original = settings.DADATA_API_KEY
        settings.DADATA_API_KEY = "dummy_key_for_test"
        try:
            with pytest.raises(ValueError, match="ИНН.*ОГРН"):
                await validate_inn("12345678901")
        finally:
            settings.DADATA_API_KEY = original


# ============================================
# BOUQUET SERVICE — COST CALCULATION
# ============================================

class TestBouquetCostCalculation:
    """Test bouquet cost calculation (no per-item markup)."""

    def test_check_stock_sufficient(self):
        """_check_stock returns None when stock is sufficient."""
        from backend.app.services.bouquets import _check_stock
        stock = {1: (100, Decimal("50")), 2: (50, Decimal("30"))}
        items = [{"flower_id": 1, "quantity": 10}, {"flower_id": 2, "quantity": 5}]
        assert _check_stock(stock, items) is None

    def test_check_stock_insufficient(self):
        """_check_stock returns error when stock is insufficient."""
        from backend.app.services.bouquets import _check_stock
        stock = {1: (5, Decimal("50"))}
        items = [{"flower_id": 1, "quantity": 10}]
        result = _check_stock(stock, items)
        assert result is not None
        assert "id=1" in result

    def test_can_assemble_count_basic(self):
        """_can_assemble_count returns correct count."""
        from backend.app.services.bouquets import _can_assemble_count

        class MockItem:
            def __init__(self, flower_id, quantity):
                self.flower_id = flower_id
                self.quantity = quantity

        stock = {1: (100, Decimal("50")), 2: (30, Decimal("30"))}
        items = [MockItem(1, 10), MockItem(2, 5)]
        # flower 1: 100 // 10 = 10, flower 2: 30 // 5 = 6 → min = 6
        assert _can_assemble_count(stock, items) == 6

    def test_can_assemble_count_empty_items(self):
        """_can_assemble_count returns 0 for empty items."""
        from backend.app.services.bouquets import _can_assemble_count
        stock = {1: (100, Decimal("50"))}
        assert _can_assemble_count(stock, []) == 0

    def test_can_assemble_count_no_stock(self):
        """_can_assemble_count returns 0 when flower not in stock."""
        from backend.app.services.bouquets import _can_assemble_count

        class MockItem:
            def __init__(self, flower_id, quantity):
                self.flower_id = flower_id
                self.quantity = quantity

        stock = {}
        items = [MockItem(1, 5)]
        assert _can_assemble_count(stock, items) == 0


# ============================================
# PRODUCT COST/MARKUP SCHEMA
# ============================================

class TestProductCostMarkupSchema:
    """Test ProductCreate/ProductUpdate schemas with cost_price and markup_percent."""

    def test_product_create_with_cost_and_markup(self):
        from backend.app.schemas import ProductCreate
        p = ProductCreate(
            seller_id=1, name="Букет роз", description="Красивый букет",
            price=1500, quantity=5, bouquet_id=1,
            cost_price=1000, markup_percent=50,
        )
        assert p.cost_price == 1000
        assert p.markup_percent == 50
        assert p.price == 1500

    def test_product_create_without_cost_markup(self):
        from backend.app.schemas import ProductCreate
        p = ProductCreate(
            seller_id=1, name="Ручной товар", description="Описание",
            price=500, quantity=10,
        )
        assert p.cost_price is None
        assert p.markup_percent is None

    def test_product_update_with_markup(self):
        from backend.app.schemas import ProductUpdate
        u = ProductUpdate(cost_price=800, markup_percent=60, price=1280)
        assert u.cost_price == 800
        assert u.markup_percent == 60

    def test_product_response_with_cost(self):
        from backend.app.schemas import ProductResponse
        r = ProductResponse(
            id=1, seller_id=1, name="Test", description="Desc",
            price=1500, quantity=5,
            cost_price=1000, markup_percent=50,
        )
        assert r.cost_price == 1000
        assert r.markup_percent == 50


# ============================================
# VALIDATION CONSTRAINTS (Pydantic Field)
# ============================================

class TestValidationConstraints:
    def test_product_create_negative_price_rejected(self):
        from backend.app.schemas import ProductCreate
        with pytest.raises(Exception):
            ProductCreate(
                seller_id=1, name="Bad", description="Desc",
                price=-100, quantity=5,
            )

    def test_product_create_zero_price_rejected(self):
        from backend.app.schemas import ProductCreate
        with pytest.raises(Exception):
            ProductCreate(
                seller_id=1, name="Bad", description="Desc",
                price=0, quantity=5,
            )

    def test_product_create_negative_quantity_rejected(self):
        from backend.app.schemas import ProductCreate
        with pytest.raises(Exception):
            ProductCreate(
                seller_id=1, name="Bad", description="Desc",
                price=100, quantity=-1,
            )

    def test_product_create_negative_cost_price_rejected(self):
        from backend.app.schemas import ProductCreate
        with pytest.raises(Exception):
            ProductCreate(
                seller_id=1, name="Bad", description="Desc",
                price=100, cost_price=-50,
            )

    def test_product_create_negative_markup_rejected(self):
        from backend.app.schemas import ProductCreate
        with pytest.raises(Exception):
            ProductCreate(
                seller_id=1, name="Bad", description="Desc",
                price=100, markup_percent=-10,
            )

    def test_bouquet_item_zero_quantity_rejected(self):
        from backend.app.schemas import BouquetItemCreate
        with pytest.raises(Exception):
            BouquetItemCreate(flower_id=1, quantity=0)

    def test_bouquet_item_negative_quantity_rejected(self):
        from backend.app.schemas import BouquetItemCreate
        with pytest.raises(Exception):
            BouquetItemCreate(flower_id=1, quantity=-3)

    def test_bouquet_create_empty_items_rejected(self):
        from backend.app.schemas import BouquetCreate
        with pytest.raises(Exception):
            BouquetCreate(name="Test", packaging_cost=0, items=[])

    def test_bouquet_create_negative_packaging_rejected(self):
        from backend.app.schemas import BouquetCreate, BouquetItemCreate
        with pytest.raises(Exception):
            BouquetCreate(
                name="Test", packaging_cost=-10,
                items=[BouquetItemCreate(flower_id=1, quantity=1)],
            )

    def test_product_update_negative_price_rejected(self):
        from backend.app.schemas import ProductUpdate
        with pytest.raises(Exception):
            ProductUpdate(price=-50)

    def test_product_update_zero_price_rejected(self):
        from backend.app.schemas import ProductUpdate
        with pytest.raises(Exception):
            ProductUpdate(price=0)

    def test_product_update_none_price_allowed(self):
        from backend.app.schemas import ProductUpdate
        u = ProductUpdate(price=None)
        assert u.price is None

    def test_bouquet_item_valid_quantity(self):
        from backend.app.schemas import BouquetItemCreate
        bi = BouquetItemCreate(flower_id=1, quantity=5)
        assert bi.quantity == 5

    def test_bouquet_item_no_markup_multiplier(self):
        """markup_multiplier was removed from BouquetItemCreate."""
        from backend.app.schemas import BouquetItemCreate
        bi = BouquetItemCreate(flower_id=1, quantity=3)
        assert not hasattr(bi, 'markup_multiplier')
