"""
Tests for multi-branch (multi-filial) functionality.

Covers:
- Branch creation and management
- Network-wide loyalty (shared customers, points across branches)
- Per-branch subscription pricing
- Branch switching (JWT)
- Auth: seller lookup by owner_id
"""
import pytest
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.user import User
from backend.app.models.seller import Seller, City, District
from backend.app.models.product import Product
from backend.app.models.loyalty import SellerCustomer
from backend.app.services.loyalty import LoyaltyService
from backend.app.services.subscription import SubscriptionService
from backend.app.api.seller_auth import create_seller_token, decode_seller_token


# ── Fixtures ─────────────────────────────────────────────────────────

@pytest.fixture
async def owner_user(test_session: AsyncSession) -> User:
    """Create an owner user for multi-branch testing."""
    user = User(
        tg_id=111000111,
        username="chainowner",
        fio="Chain Owner",
        phone="+79001110001",
        role="SELLER",
    )
    test_session.add(user)
    await test_session.commit()
    await test_session.refresh(user)
    return user


@pytest.fixture
async def city_and_district(test_session: AsyncSession):
    """Create city and district for branch testing."""
    city = City(id=99, name="Тест-Город")
    test_session.add(city)
    await test_session.flush()
    district = District(id=99, city_id=99, name="Тест-Район")
    test_session.add(district)
    await test_session.commit()
    return city, district


@pytest.fixture
async def primary_branch(
    test_session: AsyncSession, owner_user: User, city_and_district
) -> Seller:
    """Create the primary branch (seller_id == owner_id)."""
    city, district = city_and_district
    seller = Seller(
        seller_id=owner_user.tg_id,
        owner_id=owner_user.tg_id,
        shop_name="Цветы Центр",
        city_id=city.id,
        district_id=district.id,
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
        loyalty_points_percent=Decimal("5"),
    )
    test_session.add(seller)
    await test_session.commit()
    await test_session.refresh(seller)
    return seller


@pytest.fixture
async def second_branch(
    test_session: AsyncSession, owner_user: User, city_and_district, primary_branch: Seller
) -> Seller:
    """Create a second branch for the same owner."""
    city, district = city_and_district
    seller = Seller(
        seller_id=222000222,
        owner_id=owner_user.tg_id,
        shop_name="Цветы Юг",
        city_id=city.id,
        district_id=district.id,
        delivery_type="delivery",
        max_orders=5,
        active_orders=0,
        pending_requests=0,
        max_delivery_orders=5,
        max_pickup_orders=0,
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


# ── JWT Auth Tests ────────────────────────────────────────────────────

class TestJWTAuth:
    """Test JWT creation and decoding with owner_id."""

    def test_create_token_contains_owner(self, primary_branch):
        token = create_seller_token(primary_branch.seller_id, primary_branch.owner_id)
        result = decode_seller_token(token)
        assert result is not None
        seller_id, owner_id = result
        assert seller_id == primary_branch.seller_id
        assert owner_id == primary_branch.owner_id

    def test_create_token_branch_different_from_owner(self, second_branch):
        token = create_seller_token(second_branch.seller_id, second_branch.owner_id)
        result = decode_seller_token(token)
        assert result is not None
        seller_id, owner_id = result
        assert seller_id == second_branch.seller_id  # 222000222
        assert owner_id == second_branch.owner_id  # 111000111
        assert seller_id != owner_id

    def test_backwards_compat_token_without_owner(self):
        """Old tokens without 'owner' field should use seller_id as owner_id."""
        import jwt
        import os
        secret = os.getenv("JWT_SECRET", "test_admin_secret")
        payload = {"sub": "12345", "role": "seller", "exp": 9999999999}
        token = jwt.encode(payload, secret, algorithm="HS256")
        result = decode_seller_token(token)
        assert result is not None
        seller_id, owner_id = result
        assert seller_id == 12345
        assert owner_id == 12345  # falls back to seller_id


# ── Loyalty Service Tests ─────────────────────────────────────────────

class TestNetworkLoyalty:
    """Test that loyalty is shared across network branches."""

    @pytest.mark.asyncio
    async def test_create_customer_sets_network_owner(
        self, test_session, primary_branch
    ):
        """Creating customer sets network_owner_id from owner."""
        svc = LoyaltyService(test_session)
        result = await svc.create_customer(
            seller_id=primary_branch.seller_id,
            phone="+79001111111",
            first_name="Иван",
            last_name="Петров",
        )
        await test_session.commit()
        customer = await test_session.get(SellerCustomer, result["id"])
        assert customer.network_owner_id == primary_branch.owner_id

    @pytest.mark.asyncio
    async def test_customer_visible_from_other_branch(
        self, test_session, primary_branch, second_branch
    ):
        """Customer created at branch A is visible from branch B."""
        svc = LoyaltyService(test_session)
        created = await svc.create_customer(
            seller_id=primary_branch.seller_id,
            phone="+79002222222",
            first_name="Мария",
            last_name="Сидорова",
        )
        await test_session.commit()

        # Find customer from the second branch
        found = await svc.find_customer_by_phone(second_branch.seller_id, "+79002222222")
        assert found is not None
        assert found.id == created["id"]

    @pytest.mark.asyncio
    async def test_customer_list_network_wide(
        self, test_session, primary_branch, second_branch
    ):
        """list_customers returns all network customers regardless of branch."""
        svc = LoyaltyService(test_session)
        await svc.create_customer(primary_branch.seller_id, "+79003333333", "А", "Б")
        await svc.create_customer(primary_branch.seller_id, "+79004444444", "В", "Г")
        await test_session.commit()

        # List from second branch — should see both
        customers = await svc.list_customers(second_branch.seller_id)
        assert len(customers) == 2

    @pytest.mark.asyncio
    async def test_duplicate_phone_across_network(
        self, test_session, primary_branch, second_branch
    ):
        """Cannot create duplicate phone in the same network."""
        from backend.app.services.loyalty import DuplicatePhoneError
        svc = LoyaltyService(test_session)
        await svc.create_customer(primary_branch.seller_id, "+79005555555", "Дубль", "Один")
        await test_session.commit()

        with pytest.raises(DuplicatePhoneError):
            await svc.create_customer(second_branch.seller_id, "+79005555555", "Дубль", "Два")

    @pytest.mark.asyncio
    async def test_accrue_points_network_wide(
        self, test_session, primary_branch, second_branch
    ):
        """Points accrued at branch A are visible at branch B."""
        svc = LoyaltyService(test_session)
        created = await svc.create_customer(
            primary_branch.seller_id, "+79006666666", "Баллы", "Тест"
        )
        await test_session.commit()

        # Accrue at primary branch
        result = await svc.accrue_points(primary_branch.seller_id, created["id"], 1000.0)
        await test_session.commit()
        assert result["points_accrued"] == 50.0  # 5% of 1000

        # Check balance via second branch
        customer = await svc.get_customer(created["id"], second_branch.seller_id)
        assert customer is not None
        assert customer["points_balance"] == 50.0

    @pytest.mark.asyncio
    async def test_deduct_points_from_other_branch(
        self, test_session, primary_branch, second_branch
    ):
        """Points accrued at branch A can be deducted at branch B."""
        svc = LoyaltyService(test_session)
        created = await svc.create_customer(
            primary_branch.seller_id, "+79007777777", "Списание", "Тест"
        )
        await test_session.commit()

        # Accrue at branch A
        await svc.accrue_points(primary_branch.seller_id, created["id"], 2000.0)
        await test_session.commit()

        # Deduct at branch B
        deduct_result = await svc.deduct_points(
            second_branch.seller_id, created["id"], 50.0
        )
        await test_session.commit()
        assert deduct_result["points_deducted"] == 50.0
        assert deduct_result["new_balance"] == 50.0  # 100 - 50

    @pytest.mark.asyncio
    async def test_loyalty_settings_from_owner(
        self, test_session, primary_branch, second_branch
    ):
        """Loyalty percent is read from owner's record, not branch."""
        svc = LoyaltyService(test_session)
        # Primary branch has 5% set, second branch has nothing set
        percent = await svc.get_points_percent(second_branch.seller_id)
        assert percent == 5.0  # from owner's record

    @pytest.mark.asyncio
    async def test_get_all_tags_network_wide(
        self, test_session, primary_branch, second_branch
    ):
        """Tags from all network customers are visible."""
        svc = LoyaltyService(test_session)
        c1 = await svc.create_customer(
            primary_branch.seller_id, "+79008888881", "Тег", "Один"
        )
        c2 = await svc.create_customer(
            primary_branch.seller_id, "+79008888882", "Тег", "Два"
        )
        await test_session.commit()

        await svc.update_customer(primary_branch.seller_id, c1["id"], tags=["VIP"])
        await svc.update_customer(primary_branch.seller_id, c2["id"], tags=["корпоративный"])
        await test_session.commit()

        tags = await svc.get_all_tags(second_branch.seller_id)
        assert "VIP" in tags
        assert "корпоративный" in tags


# ── Subscription Per-Branch Pricing Tests ─────────────────────────────

class TestPerBranchPricing:
    """Test subscription pricing multiplied by branch count."""

    @pytest.mark.asyncio
    async def test_single_branch_prices(self, test_session, primary_branch):
        """Single branch = base prices."""
        svc = SubscriptionService(test_session)
        prices_1 = svc.get_prices(branches_count=1)
        prices_2 = svc.get_prices(branches_count=2)
        # Every price at 2 branches should be exactly 2x
        for period in (1, 3, 6, 12):
            assert prices_2[period] == prices_1[period] * 2

    @pytest.mark.asyncio
    async def test_count_active_branches(
        self, test_session, primary_branch, second_branch
    ):
        """Count active branches for owner."""
        svc = SubscriptionService(test_session)
        count = await svc._count_active_branches(primary_branch.owner_id)
        assert count == 2

    @pytest.mark.asyncio
    async def test_count_excludes_deleted(
        self, test_session, primary_branch, second_branch
    ):
        """Deleted branches don't count."""
        from datetime import datetime
        second_branch.deleted_at = datetime.utcnow()
        await test_session.commit()

        svc = SubscriptionService(test_session)
        count = await svc._count_active_branches(primary_branch.owner_id)
        assert count == 1


# ── Branch Products Isolation Tests ──────────────────────────────────

class TestBranchProducts:
    """Test that products are separate per branch."""

    @pytest.mark.asyncio
    async def test_products_belong_to_branch(
        self, test_session, primary_branch, second_branch
    ):
        """Products are scoped to their branch, not shared."""
        p1 = Product(
            seller_id=primary_branch.seller_id,
            name="Букет Роз (Центр)",
            price=3000,
            is_active=True,
        )
        p2 = Product(
            seller_id=second_branch.seller_id,
            name="Букет Тюльпанов (Юг)",
            price=2000,
            is_active=True,
        )
        test_session.add_all([p1, p2])
        await test_session.commit()

        from sqlalchemy import select
        # Products for primary branch
        r1 = await test_session.execute(
            select(Product).where(Product.seller_id == primary_branch.seller_id)
        )
        products_1 = r1.scalars().all()
        assert len(products_1) == 1
        assert products_1[0].name == "Букет Роз (Центр)"

        # Products for second branch
        r2 = await test_session.execute(
            select(Product).where(Product.seller_id == second_branch.seller_id)
        )
        products_2 = r2.scalars().all()
        assert len(products_2) == 1
        assert products_2[0].name == "Букет Тюльпанов (Юг)"


# ── Owner ID Helper Tests ────────────────────────────────────────────

class TestOwnerIdLookup:
    """Test _get_owner_id helper in services."""

    @pytest.mark.asyncio
    async def test_loyalty_get_owner_id(
        self, test_session, primary_branch, second_branch
    ):
        """Both branches resolve to the same owner_id."""
        svc = LoyaltyService(test_session)
        owner1 = await svc._get_owner_id(primary_branch.seller_id)
        owner2 = await svc._get_owner_id(second_branch.seller_id)
        assert owner1 == owner2
        assert owner1 == primary_branch.owner_id

    @pytest.mark.asyncio
    async def test_subscription_get_owner_id(
        self, test_session, primary_branch, second_branch
    ):
        """SubscriptionService resolves owner_id correctly."""
        svc = SubscriptionService(test_session)
        owner1 = await svc._get_owner_id(primary_branch.seller_id)
        owner2 = await svc._get_owner_id(second_branch.seller_id)
        assert owner1 == owner2
