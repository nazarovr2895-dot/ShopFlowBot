# backend/app/services/cart.py
"""Cart and favorites services for Mini App."""
from datetime import date, datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_, func
from typing import List, Dict, Any, Optional
from decimal import Decimal, ROUND_HALF_UP

from backend.app.models.cart import CartItem, BuyerFavoriteSeller, BuyerFavoriteProduct
from backend.app.models.order import Order
from backend.app.models.product import Product
from backend.app.models.seller import Seller
from backend.app.models.user import User
from backend.app.services.orders import OrderService, OrderServiceError
from backend.app.services.sellers import get_preorder_available_dates, normalize_delivery_type_setting
from backend.app.services.reservations import ReservationService


class CartServiceError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class CartService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_cart(self, buyer_id: int) -> List[Dict[str, Any]]:
        """Get cart grouped by seller. Returns list of { seller_id, shop_name, items, total }."""
        # Lazy cleanup: release expired reservations and remove those cart items
        reservation_svc = ReservationService(self.session)
        await reservation_svc.release_expired_for_buyer(buyer_id)

        result = await self.session.execute(
            select(CartItem).where(CartItem.buyer_id == buyer_id).order_by(CartItem.seller_id, CartItem.product_id)
        )
        rows = result.scalars().all()
        if not rows:
            return []

        # Group by seller
        by_seller: Dict[int, List[CartItem]] = {}
        for item in rows:
            by_seller.setdefault(item.seller_id, []).append(item)

        # Get shop names
        seller_ids = list(by_seller.keys())
        sellers_result = await self.session.execute(select(Seller).where(Seller.seller_id.in_(seller_ids)))
        sellers = {s.seller_id: s for s in sellers_result.scalars().all()}

        # Load products for photo_id (one query)
        product_ids = list({it.product_id for it in rows})
        products_result = await self.session.execute(select(Product).where(Product.id.in_(product_ids)))
        products = {p.id: p for p in products_result.scalars().all()}

        def _photo_id_for(product_id: int):
            p = products.get(product_id)
            if not p:
                return None
            ids = getattr(p, "photo_ids", None)
            if ids and len(ids) > 0:
                return ids[0]
            return getattr(p, "photo_id", None)

        # Check which sellers have active delivery zones (batch)
        from backend.app.services.delivery_zones import DeliveryZoneService
        zone_svc = DeliveryZoneService(self.session)

        out = []
        for seller_id, items in by_seller.items():
            seller = sellers.get(seller_id)
            shop_name = (seller.shop_name or "Магазин") if seller else "Магазин"
            total = sum(Decimal(str(it.price)) * it.quantity for it in items)

            # If seller has delivery zones, delivery_price depends on address → return null
            active_zones = await zone_svc.get_active_zones(seller_id)
            has_delivery_zones = len(active_zones) > 0
            # delivery_price depends on address (zones) → always null
            # Without zones, delivery is not available
            delivery_price_out = None

            address_name = getattr(seller, "address_name", None) if seller else None
            address_name = address_name if address_name and str(address_name).strip() else None
            map_url = getattr(seller, "map_url", None) if seller else None
            map_url = map_url if map_url and str(map_url).strip() else None
            out.append({
                "seller_id": seller_id,
                "shop_name": shop_name,
                "items": [
                    {
                        "product_id": it.product_id,
                        "name": it.name,
                        "price": float(it.price),
                        "quantity": it.quantity,
                        "is_preorder": getattr(it, "is_preorder", False),
                        "preorder_delivery_date": it.preorder_delivery_date.isoformat() if getattr(it, "preorder_delivery_date", None) else None,
                        "photo_id": _photo_id_for(it.product_id),
                        "reserved_at": it.reserved_at.isoformat() if getattr(it, "reserved_at", None) else None,
                    }
                    for it in items
                ],
                "total": float(total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
                "delivery_price": delivery_price_out,
                "has_delivery_zones": has_delivery_zones,
                "address_name": address_name,
                "map_url": map_url,
                "delivery_type": normalize_delivery_type_setting(seller.delivery_type) if seller else None,
                "city_id": getattr(seller, "city_id", None) if seller else None,
            })
        return out

    async def add_item(
        self,
        buyer_id: int,
        product_id: int,
        quantity: int = 1,
        preorder_delivery_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Add or update cart item. For preorder products, preorder_delivery_date (YYYY-MM-DD) is required."""
        if quantity < 1:
            raise CartServiceError("Quantity must be >= 1", 400)
        product = await self.session.get(Product, product_id)
        if not product or not product.is_active:
            raise CartServiceError("Product not found", 404)
        is_preorder = getattr(product, "is_preorder", False)
        preorder_date: Optional[date] = None
        if is_preorder:
            if not preorder_delivery_date or not preorder_delivery_date.strip():
                raise CartServiceError("Для предзаказа укажите дату поставки", 400)
            try:
                preorder_date = date.fromisoformat(preorder_delivery_date.strip()[:10])
            except ValueError:
                raise CartServiceError("Неверный формат даты (ожидается ГГГГ-ММ-ДД)", 400)
            seller = await self.session.get(Seller, product.seller_id)
            if seller and getattr(seller, "preorder_enabled", False):
                available = get_preorder_available_dates(
                    getattr(seller, "preorder_enabled", False),
                    getattr(seller, "preorder_schedule_type", None),
                    getattr(seller, "preorder_weekday", None),
                    getattr(seller, "preorder_interval_days", None),
                    getattr(seller, "preorder_base_date", None),
                    getattr(seller, "preorder_custom_dates", None),
                    min_lead_days=getattr(seller, "preorder_min_lead_days", 2) or 0,
                )
                if preorder_date.isoformat() not in available:
                    raise CartServiceError("Выбранная дата недоступна для предзаказа", 400)
                # Check per-date capacity limit
                max_per_date = getattr(seller, "preorder_max_per_date", None)
                if max_per_date and max_per_date > 0:
                    count_result = await self.session.execute(
                        select(func.count(Order.id)).where(
                            and_(
                                Order.seller_id == product.seller_id,
                                Order.is_preorder.is_(True),
                                Order.preorder_delivery_date == preorder_date,
                                Order.status.notin_(["rejected", "cancelled"]),
                            )
                        )
                    )
                    current_count = count_result.scalar() or 0
                    if current_count >= max_per_date:
                        raise CartServiceError(f"На эту дату все места заняты (лимит: {max_per_date})", 409)
        else:
            # Lazy cleanup expired reservations for this buyer first
            reservation_svc = ReservationService(self.session)
            await reservation_svc.release_expired_for_buyer(buyer_id)
            # Re-fetch product after cleanup (reserved_quantity may have changed)
            await self.session.refresh(product)
            available = product.quantity - product.reserved_quantity
            if available < 1:
                raise CartServiceError("Товар закончился", 409)
            if quantity > available:
                quantity = available
        # For preorder items: match by (buyer, seller, product, date) to allow same product on different dates
        filters = [
            CartItem.buyer_id == buyer_id,
            CartItem.seller_id == product.seller_id,
            CartItem.product_id == product_id,
        ]
        if is_preorder:
            filters.append(CartItem.preorder_delivery_date == preorder_date)
        else:
            filters.append(CartItem.preorder_delivery_date.is_(None))
        existing = await self.session.execute(
            select(CartItem).where(and_(*filters))
        )
        item = existing.scalar_one_or_none()
        if is_preorder:
            # Preorder: no reservation, just upsert
            if item:
                item.quantity = item.quantity + quantity
            else:
                item = CartItem(
                    buyer_id=buyer_id,
                    seller_id=product.seller_id,
                    product_id=product_id,
                    quantity=quantity,
                    name=product.name,
                    price=product.price,
                    is_preorder=True,
                    preorder_delivery_date=preorder_date,
                )
                self.session.add(item)
        else:
            # Regular product: reserve stock
            reservation_svc = ReservationService(self.session)
            if item:
                old_qty = item.quantity
                new_qty = old_qty + quantity
                available_for_increase = product.quantity - product.reserved_quantity + old_qty
                if new_qty > available_for_increase:
                    new_qty = available_for_increase
                delta = new_qty - old_qty
                if delta > 0:
                    await reservation_svc.reserve_stock(product_id, delta)
                elif delta < 0:
                    await reservation_svc.release_stock(product_id, abs(delta))
                item.quantity = new_qty
                item.reserved_at = datetime.utcnow()
            else:
                reserved_at = await reservation_svc.reserve_stock(product_id, quantity)
                item = CartItem(
                    buyer_id=buyer_id,
                    seller_id=product.seller_id,
                    product_id=product_id,
                    quantity=quantity,
                    name=product.name,
                    price=product.price,
                    is_preorder=False,
                    preorder_delivery_date=None,
                    reserved_at=reserved_at,
                )
                self.session.add(item)
        await self.session.flush()
        return {
            "product_id": product_id,
            "quantity": item.quantity,
            "seller_id": product.seller_id,
            "reserved_at": item.reserved_at.isoformat() if getattr(item, "reserved_at", None) else None,
        }

    async def update_item(self, buyer_id: int, product_id: int, quantity: int) -> None:
        """Set item quantity. 0 = remove."""
        result = await self.session.execute(
            select(CartItem).where(
                and_(CartItem.buyer_id == buyer_id, CartItem.product_id == product_id)
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            return
        reservation_svc = ReservationService(self.session)
        if quantity <= 0:
            # Release reservation before removing
            await reservation_svc.release_reservation(item)
            await self.session.delete(item)
            await self.session.flush()
            return
        product = await self.session.get(Product, product_id)
        if not product:
            return
        old_qty = item.quantity
        if not item.is_preorder:
            # Cap to available stock (current reserved by this item + free)
            available_for_item = product.quantity - product.reserved_quantity + old_qty
            if quantity > available_for_item:
                quantity = available_for_item
            delta = quantity - old_qty
            if delta > 0:
                await reservation_svc.reserve_stock(product_id, delta)
            elif delta < 0:
                await reservation_svc.release_stock(product_id, abs(delta))
            item.reserved_at = datetime.utcnow()  # refresh timer on edit
        else:
            if product.quantity < quantity:
                quantity = product.quantity
        item.quantity = quantity
        await self.session.flush()

    async def remove_item(self, buyer_id: int, product_id: int) -> None:
        result = await self.session.execute(
            select(CartItem).where(
                and_(CartItem.buyer_id == buyer_id, CartItem.product_id == product_id)
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            return
        reservation_svc = ReservationService(self.session)
        await reservation_svc.release_reservation(item)
        await self.session.delete(item)
        await self.session.flush()

    async def clear_cart(self, buyer_id: int) -> None:
        result = await self.session.execute(
            select(CartItem).where(CartItem.buyer_id == buyer_id)
        )
        items = result.scalars().all()
        reservation_svc = ReservationService(self.session)
        for item in items:
            await reservation_svc.release_reservation(item)
        await self.session.execute(delete(CartItem).where(CartItem.buyer_id == buyer_id))

    async def checkout(
        self,
        buyer_id: int,
        fio: str,
        phone: str,
        delivery_type: str,
        address: str,
        comment: Optional[str] = None,
        points_by_seller: Optional[Dict[int, float]] = None,
        delivery_by_seller: Optional[Dict[int, str]] = None,
        buyer_district_id: Optional[int] = None,
        buyer_district_name: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Create one order per (seller, is_preorder) from cart, then clear cart.
        Regular and preorder items for the same seller become separate orders.
        points_by_seller: {seller_id: points_to_use} — optional loyalty points discount.
        delivery_by_seller: {seller_id: delivery_type} — per-seller delivery type override.
        Returns list of { order_id, seller_id, total_price }.
        """
        from backend.app.services.loyalty import LoyaltyService

        # Validate all reservations are still active before checkout
        reservation_svc = ReservationService(self.session)
        released = await reservation_svc.release_expired_for_buyer(buyer_id)

        groups = await self.get_cart(buyer_id)
        if not groups:
            raise CartServiceError("Cart is empty", 400)

        # Ensure fio has a value (should be set by API, but add fallback for safety)
        if not fio or not fio.strip():
            fio = "Покупатель"

        order_service = OrderService(self.session)
        loyalty_svc = LoyaltyService(self.session)
        created = []
        for group in groups:
            seller_id = group["seller_id"]
            seller = await self.session.get(Seller, seller_id)
            # Resolve delivery type for this seller
            seller_delivery = (delivery_by_seller or {}).get(seller_id, delivery_type)
            addr = address
            if seller_delivery == "Самовывоз" and seller and getattr(seller, "map_url", None):
                addr = (seller.map_url or "") + f"\n📞 {phone}\n👤 {fio}"
            else:
                addr = f"{address}\n📞 {phone}\n👤 {fio}"
            # Split items by is_preorder
            regular_items = [it for it in group["items"] if not it.get("is_preorder")]
            preorder_items = [it for it in group["items"] if it.get("is_preorder")]
            for is_preorder, items in [(False, regular_items), (True, preorder_items)]:
                if not items:
                    continue
                total = sum(Decimal(str(it["price"])) * it["quantity"] for it in items)
                # Delivery fee calculation: zone-based or legacy flat price
                zone_match = None
                delivery_fee = Decimal("0")
                if seller and seller_delivery == "Доставка":
                    from backend.app.services.delivery_zones import DeliveryZoneService
                    zone_svc = DeliveryZoneService(self.session)
                    zones = await zone_svc.get_active_zones(seller_id)
                    # Resolve district ID from name if needed
                    resolved_district_id = buyer_district_id
                    if resolved_district_id is None and buyer_district_name:
                        resolved_district_id = await zone_svc.resolve_district_id(buyer_district_name)
                    if zones and resolved_district_id is not None:
                        zone_match = await zone_svc.find_zone_for_address(seller_id, district_id=resolved_district_id)
                        if zone_match is None:
                            raise CartServiceError("Магазин не доставляет по вашему адресу", 400)
                        delivery_fee = Decimal(str(zone_match["delivery_price"]))
                        # Free delivery threshold
                        if zone_match.get("free_delivery_from") and total >= Decimal(str(zone_match["free_delivery_from"])):
                            delivery_fee = Decimal("0")
                        total += delivery_fee
                    elif not zones:
                        # No zones configured — delivery not available
                        raise CartServiceError("Доставка недоступна — настройте зоны доставки", 400)
                items_info = ", ".join(f"{it['product_id']}:{it['name']}@{it['price']} x {it['quantity']}" for it in items)
                preorder_date: Optional[date] = None
                if is_preorder and items:
                    d = items[0].get("preorder_delivery_date")
                    if d:
                        try:
                            preorder_date = date.fromisoformat(d[:10])
                        except (ValueError, TypeError):
                            pass
                # Early bird preorder discount
                preorder_discount_amount = Decimal("0")
                if is_preorder and preorder_date and seller:
                    discount_pct = Decimal(str(getattr(seller, "preorder_discount_percent", 0) or 0))
                    min_days = int(getattr(seller, "preorder_discount_min_days", 7) or 7)
                    if discount_pct > 0:
                        from datetime import date as _date
                        days_ahead = (preorder_date - _date.today()).days
                        if days_ahead >= min_days:
                            preorder_discount_amount = total * discount_pct / Decimal("100")
                            total -= preorder_discount_amount
                # Points discount calculation
                points_used = Decimal("0")
                points_discount = Decimal("0")
                if points_by_seller and seller_id in points_by_seller:
                    requested_points = Decimal(str(points_by_seller[seller_id]))
                    if requested_points > 0:
                        rate = Decimal(str(getattr(seller, "points_to_ruble_rate", 1) or 1))
                        max_pct = int(getattr(seller, "max_points_discount_percent", 100) or 100)
                        max_discount = total * Decimal(str(max_pct)) / Decimal("100")
                        discount = min(requested_points * rate, max_discount)
                        # Verify customer has enough points
                        customer = await loyalty_svc.find_customer_by_phone(seller_id, phone)
                        if customer:
                            balance = customer.points_balance or Decimal("0")
                            actual_points = min(requested_points, balance)
                            discount = min(actual_points * rate, max_discount)
                            if discount > 0:
                                points_used = actual_points
                                points_discount = discount
                                total = total - discount
                # Track original price before discounts for loyalty accrual
                original_total = total + preorder_discount_amount + points_discount
                try:
                    order = await order_service.create_order(
                        buyer_id=buyer_id,
                        seller_id=seller_id,
                        items_info=items_info,
                        total_price=total,
                        delivery_type=seller_delivery,
                        address=addr,
                        comment=(comment or "").strip() or None,
                        is_preorder=is_preorder,
                        preorder_delivery_date=preorder_date,
                    )
                    # Save delivery zone info on order
                    if zone_match:
                        order.delivery_zone_id = zone_match["id"]
                        order.delivery_fee = float(Decimal(str(zone_match["delivery_price"])))
                    # No flat price fallback — delivery_fee comes only from zones
                    # Save original price if any discount was applied
                    if preorder_discount_amount > 0 or points_discount > 0:
                        order.original_price = float(original_total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
                    # Deduct points AFTER order creation succeeds (avoid losing points on failure)
                    if points_used > 0 and customer:
                        await loyalty_svc.deduct_points(seller_id, customer.id, float(points_used), order_id=order.id)
                    # Store points info on order
                    if points_used > 0:
                        order.points_used = float(points_used)
                        order.points_discount = float(points_discount)
                    created.append({
                        "order_id": order.id,
                        "seller_id": seller_id,
                        "total_price": float(order.total_price),
                        "points_used": float(points_used),
                        "points_discount": float(points_discount),
                        "items_info": items_info,
                        "is_preorder": is_preorder,
                        "preorder_delivery_date": preorder_date.isoformat() if preorder_date else None,
                        "delivery_type": seller_delivery,
                        "delivery_fee": float(order.delivery_fee) if order.delivery_fee else None,
                        "delivery_zone_name": zone_match["name"] if zone_match else None,
                    })
                except OrderServiceError as e:
                    raise CartServiceError(e.message, e.status_code)
        await self.clear_cart(buyer_id)
        return created


class FavoriteSellersService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(self, buyer_id: int, seller_id: int) -> None:
        """Subscribe buyer to seller (idempotent). Auto-links to loyalty if buyer has phone."""
        seller = await self.session.get(Seller, seller_id)
        if not seller:
            raise CartServiceError("Магазин не найден", 404)
        if getattr(seller, "is_blocked", False) or getattr(seller, "deleted_at", None):
            raise CartServiceError("Магазин недоступен", 400)
        result = await self.session.execute(
            select(BuyerFavoriteSeller).where(
                and_(
                    BuyerFavoriteSeller.buyer_id == buyer_id,
                    BuyerFavoriteSeller.seller_id == seller_id,
                )
            )
        )
        if result.scalar_one_or_none():
            return  # already subscribed
        self.session.add(BuyerFavoriteSeller(buyer_id=buyer_id, seller_id=seller_id))
        await self.session.flush()
        # Auto-link to loyalty system
        await self._auto_link_loyalty(buyer_id, seller_id)

    async def _auto_link_loyalty(self, buyer_id: int, seller_id: int) -> None:
        """If buyer has phone, create SellerCustomer record if not exists."""
        from backend.app.models.loyalty import normalize_phone
        from backend.app.services.loyalty import LoyaltyService

        buyer = await self.session.get(User, buyer_id)
        if not buyer or not buyer.phone:
            return
        loyalty_svc = LoyaltyService(self.session)
        normalized = normalize_phone(buyer.phone)
        if not normalized:
            return
        existing = await loyalty_svc.find_customer_by_phone(seller_id, normalized)
        if existing:
            if not existing.linked_user_id:
                existing.linked_user_id = buyer_id
            return
        try:
            fio_parts = (buyer.fio or "").split() if buyer.fio else []
            first_name = fio_parts[0] if fio_parts else "Подписчик"
            last_name = " ".join(fio_parts[1:]) if len(fio_parts) > 1 else ""
            await loyalty_svc.create_customer(
                seller_id=seller_id,
                phone=normalized,
                first_name=first_name,
                last_name=last_name,
            )
            new_customer = await loyalty_svc.find_customer_by_phone(seller_id, normalized)
            if new_customer:
                new_customer.linked_user_id = buyer_id
        except Exception:
            pass  # Don't fail subscription if loyalty creation fails

    async def remove(self, buyer_id: int, seller_id: int) -> None:
        """Remove seller from favorites."""
        await self.session.execute(
            delete(BuyerFavoriteSeller).where(
                and_(
                    BuyerFavoriteSeller.buyer_id == buyer_id,
                    BuyerFavoriteSeller.seller_id == seller_id,
                )
            )
        )

    async def get_subscriber_count(self, seller_id: int) -> int:
        """Count subscribers for a seller."""
        result = await self.session.execute(
            select(func.count()).select_from(BuyerFavoriteSeller).where(
                BuyerFavoriteSeller.seller_id == seller_id
            )
        )
        return result.scalar() or 0

    async def get_subscribers(self, seller_id: int) -> List[Dict[str, Any]]:
        """Get all subscribers for a seller with user info and loyalty status."""
        from backend.app.models.loyalty import SellerCustomer

        result = await self.session.execute(
            select(
                BuyerFavoriteSeller,
                User.username,
                User.fio,
                User.phone,
                SellerCustomer.card_number,
                SellerCustomer.points_balance,
                SellerCustomer.id.label("customer_id"),
            )
            .join(User, BuyerFavoriteSeller.buyer_id == User.tg_id)
            .outerjoin(
                SellerCustomer,
                and_(
                    SellerCustomer.seller_id == BuyerFavoriteSeller.seller_id,
                    SellerCustomer.linked_user_id == BuyerFavoriteSeller.buyer_id,
                )
            )
            .where(BuyerFavoriteSeller.seller_id == seller_id)
            .order_by(BuyerFavoriteSeller.subscribed_at.desc())
        )
        rows = result.all()
        return [
            {
                "buyer_id": row[0].buyer_id,
                "username": row.username,
                "fio": row.fio,
                "phone": row.phone,
                "subscribed_at": row[0].subscribed_at.isoformat() if row[0].subscribed_at else None,
                "loyalty_card_number": row.card_number,
                "loyalty_points": float(row.points_balance) if row.points_balance else 0,
                "loyalty_customer_id": row.customer_id,
                "has_loyalty": row.card_number is not None,
            }
            for row in rows
        ]

    async def get_subscribers_with_customers(self, seller_id: int) -> List[Dict[str, Any]]:
        """Get unified list: all subscribers + standalone loyalty customers (without subscription).
        Used by the Customers page to show the full client base.
        """
        from backend.app.models.loyalty import SellerCustomer
        from backend.app.models.order import Order
        from backend.app.services.loyalty import compute_rfm_segment

        # 1. All subscribers with user info + optional loyalty card data
        result = await self.session.execute(
            select(
                BuyerFavoriteSeller,
                User.username,
                User.fio,
                User.phone,
                SellerCustomer.card_number,
                SellerCustomer.points_balance,
                SellerCustomer.id.label("customer_id"),
                SellerCustomer.first_name.label("sc_first_name"),
                SellerCustomer.last_name.label("sc_last_name"),
                SellerCustomer.tags.label("sc_tags"),
                SellerCustomer.birthday.label("sc_birthday"),
                SellerCustomer.created_at.label("sc_created_at"),
            )
            .join(User, BuyerFavoriteSeller.buyer_id == User.tg_id)
            .outerjoin(
                SellerCustomer,
                and_(
                    SellerCustomer.seller_id == BuyerFavoriteSeller.seller_id,
                    SellerCustomer.linked_user_id == BuyerFavoriteSeller.buyer_id,
                )
            )
            .where(BuyerFavoriteSeller.seller_id == seller_id)
            .order_by(BuyerFavoriteSeller.subscribed_at.desc())
        )
        subscriber_rows = result.all()

        # Collect buyer_ids that are already in subscriber list (to avoid duplicates)
        subscriber_buyer_ids = {row[0].buyer_id for row in subscriber_rows}

        # 2. Standalone loyalty customers (no linked_user_id or linked but not subscribed)
        result2 = await self.session.execute(
            select(SellerCustomer)
            .where(
                SellerCustomer.seller_id == seller_id,
                SellerCustomer.linked_user_id.is_(None),
            )
        )
        standalone_customers = result2.scalars().all()

        # 3. Get order stats for RFM segmentation (by buyer_id)
        # Gather all buyer_ids to compute segments
        all_buyer_ids = list(subscriber_buyer_ids)
        order_stats: Dict[int, Dict[str, Any]] = {}  # buyer_id -> {last_order, count, total}

        if all_buyer_ids:
            order_result = await self.session.execute(
                select(
                    Order.buyer_id,
                    func.count(Order.id).label("order_count"),
                    func.sum(Order.total_price).label("total_spent"),
                    func.max(Order.created_at).label("last_order_at"),
                )
                .where(
                    Order.seller_id == seller_id,
                    Order.buyer_id.in_(all_buyer_ids),
                    Order.status.in_(["done", "completed"]),
                )
                .group_by(Order.buyer_id)
            )
            for orow in order_result.all():
                order_stats[orow.buyer_id] = {
                    "order_count": orow.order_count or 0,
                    "total_spent": float(orow.total_spent or 0),
                    "last_order_at": orow.last_order_at,
                }

        # 4. Also get order stats by phone for standalone customers
        standalone_phones = [sc.phone for sc in standalone_customers if sc.phone]
        phone_order_stats: Dict[str, Dict[str, Any]] = {}
        if standalone_phones:
            # Match orders by buyer phone
            phone_result = await self.session.execute(
                select(
                    User.phone,
                    func.count(Order.id).label("order_count"),
                    func.sum(Order.total_price).label("total_spent"),
                    func.max(Order.created_at).label("last_order_at"),
                )
                .join(Order, Order.buyer_id == User.tg_id)
                .where(
                    Order.seller_id == seller_id,
                    User.phone.in_(standalone_phones),
                    Order.status.in_(["done", "completed"]),
                )
                .group_by(User.phone)
            )
            for prow in phone_result.all():
                if prow.phone:
                    phone_order_stats[prow.phone] = {
                        "order_count": prow.order_count or 0,
                        "total_spent": float(prow.total_spent or 0),
                        "last_order_at": prow.last_order_at,
                    }

        # 5. Build unified list
        unified: List[Dict[str, Any]] = []

        for row in subscriber_rows:
            bfs = row[0]
            buyer_id = bfs.buyer_id
            stats = order_stats.get(buyer_id, {"order_count": 0, "total_spent": 0, "last_order_at": None})
            last_dt = stats["last_order_at"]
            last_date = last_dt.date() if last_dt else None
            segment = compute_rfm_segment(last_date, stats["order_count"], stats["total_spent"])

            unified.append({
                "buyer_id": buyer_id,
                "username": row.username,
                "fio": row.fio,
                "phone": row.phone,
                "subscribed_at": bfs.subscribed_at.isoformat() if bfs.subscribed_at else None,
                "loyalty_card_number": row.card_number,
                "loyalty_points": float(row.points_balance) if row.points_balance else 0,
                "loyalty_customer_id": row.customer_id,
                "has_loyalty": row.card_number is not None,
                "first_name": row.sc_first_name,
                "last_name": row.sc_last_name,
                "tags": row.sc_tags,
                "birthday": row.sc_birthday.isoformat() if row.sc_birthday else None,
                "segment": segment,
            })

        for sc in standalone_customers:
            stats = phone_order_stats.get(sc.phone, {"order_count": 0, "total_spent": 0, "last_order_at": None})
            last_dt = stats["last_order_at"]
            last_date = last_dt.date() if last_dt else None
            segment = compute_rfm_segment(last_date, stats["order_count"], stats["total_spent"])

            unified.append({
                "buyer_id": None,
                "username": None,
                "fio": None,
                "phone": sc.phone,
                "subscribed_at": sc.created_at.isoformat() if sc.created_at else None,
                "loyalty_card_number": sc.card_number,
                "loyalty_points": float(sc.points_balance) if sc.points_balance else 0,
                "loyalty_customer_id": sc.id,
                "has_loyalty": True,
                "first_name": sc.first_name,
                "last_name": sc.last_name,
                "tags": sc.tags,
                "birthday": sc.birthday.isoformat() if sc.birthday else None,
                "segment": segment,
            })

        return unified

    async def auto_link_loyalty_for_subscriptions(self, buyer_id: int) -> None:
        """Auto-create loyalty records for all existing subscriptions when buyer adds phone."""
        result = await self.session.execute(
            select(BuyerFavoriteSeller).where(BuyerFavoriteSeller.buyer_id == buyer_id)
        )
        for sub in result.scalars().all():
            await self._auto_link_loyalty(buyer_id, sub.seller_id)

    async def get_favorite_sellers(self, buyer_id: int) -> List[Dict[str, Any]]:
        """Get subscribed sellers with shop_name, owner_fio (same shape as visited for frontend)."""
        from backend.app.models.seller import Seller
        from backend.app.models.user import User

        result = await self.session.execute(
            select(BuyerFavoriteSeller).where(BuyerFavoriteSeller.buyer_id == buyer_id)
        )
        favs = result.scalars().all()
        if not favs:
            return []
        seller_ids = [f.seller_id for f in favs]
        sellers_result = await self.session.execute(
            select(Seller, User.fio).outerjoin(User, Seller.seller_id == User.tg_id).where(
                Seller.seller_id.in_(seller_ids)
            )
        )
        sellers_map = {}
        for row in sellers_result.all():
            s, fio = row[0], row[1]
            sellers_map[s.seller_id] = {
                "seller_id": s.seller_id,
                "shop_name": s.shop_name or "Магазин",
                "owner_fio": fio,
            }
        return [sellers_map[f.seller_id] for f in favs if f.seller_id in sellers_map]


class FavoriteProductsService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(self, buyer_id: int, product_id: int) -> None:
        """Add product to favorites (idempotent). Validates product exists."""
        product = await self.session.get(Product, product_id)
        if not product:
            raise CartServiceError("Товар не найден", 404)
        result = await self.session.execute(
            select(BuyerFavoriteProduct).where(
                and_(
                    BuyerFavoriteProduct.buyer_id == buyer_id,
                    BuyerFavoriteProduct.product_id == product_id,
                )
            )
        )
        if result.scalar_one_or_none():
            return  # already in favorites
        self.session.add(BuyerFavoriteProduct(buyer_id=buyer_id, product_id=product_id))
        await self.session.flush()

    async def remove(self, buyer_id: int, product_id: int) -> None:
        """Remove product from favorites."""
        await self.session.execute(
            delete(BuyerFavoriteProduct).where(
                and_(
                    BuyerFavoriteProduct.buyer_id == buyer_id,
                    BuyerFavoriteProduct.product_id == product_id,
                )
            )
        )

    async def get_favorite_products(self, buyer_id: int) -> List[Dict[str, Any]]:
        """Get favorite products with full product and seller information."""
        result = await self.session.execute(
            select(BuyerFavoriteProduct).where(BuyerFavoriteProduct.buyer_id == buyer_id)
        )
        favs = result.scalars().all()
        if not favs:
            return []
        product_ids = [f.product_id for f in favs]
        
        # Get products with their sellers
        products_result = await self.session.execute(
            select(Product, Seller.shop_name, Seller.seller_id).join(
                Seller, Product.seller_id == Seller.seller_id
            ).where(Product.id.in_(product_ids))
        )
        
        products_map = {}
        for row in products_result.all():
            p, shop_name, seller_id = row[0], row[1], row[2]
            first_photo_id = (p.photo_ids[0] if p.photo_ids and len(p.photo_ids) > 0 else None) or p.photo_id
            products_map[p.id] = {
                "product_id": p.id,
                "name": p.name,
                "description": p.description,
                "price": float(p.price),
                "photo_id": first_photo_id,
                "photo_ids": p.photo_ids,
                "quantity": p.quantity,
                "is_preorder": getattr(p, 'is_preorder', False),
                "seller_id": seller_id,
                "shop_name": shop_name or "Магазин",
            }
        return [products_map[f.product_id] for f in favs if f.product_id in products_map]
