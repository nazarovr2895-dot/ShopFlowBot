# backend/app/services/orders.py
"""
Order service - handles all order-related business logic.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List, Dict, Any
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timedelta, date
import re

from backend.app.core.logging import get_logger
from backend.app.models.order import Order
from backend.app.models.seller import Seller

logger = get_logger(__name__)
from backend.app.models.product import Product
from backend.app.models.user import User
from backend.app.models.loyalty import normalize_phone
from backend.app.models.crm import Bouquet
from backend.app.services.sellers import SellerService, normalize_delivery_type, normalize_delivery_type_setting
from backend.app.services.bouquets import check_bouquet_stock, deduct_bouquet_from_receptions
from backend.app.services.loyalty import LoyaltyService

# Import metrics
try:
    from backend.app.core.metrics import orders_created_total, orders_completed_total
except ImportError:
    # Metrics not available (e.g., in tests)
    orders_created_total = None
    orders_completed_total = None


class OrderServiceError(Exception):
    """Base exception for order service errors."""
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class SellerNotFoundError(OrderServiceError):
    def __init__(self, seller_id: int):
        super().__init__(f"Seller {seller_id} not found", 404)


class SellerBlockedError(OrderServiceError):
    def __init__(self, seller_id: int):
        super().__init__(f"Seller {seller_id} is blocked", 403)


class SellerLimitReachedError(OrderServiceError):
    def __init__(self, seller_id: int):
        super().__init__(f"Seller {seller_id} is busy (limit reached)", 409)


class OrderNotFoundError(OrderServiceError):
    def __init__(self, order_id: int):
        super().__init__(f"Order {order_id} not found", 404)


class InvalidOrderStatusError(OrderServiceError):
    def __init__(self, order_id: int, current_status: str, expected_status: str):
        super().__init__(
            f"Order {order_id} has status '{current_status}', expected '{expected_status}'",
            400
        )


class OrderAccessDeniedError(OrderServiceError):
    def __init__(self, order_id: int):
        super().__init__(f"Access denied to order {order_id}", 403)


class OrderService:
    """Service class for order operations."""
    
    VALID_STATUSES = ["pending", "accepted", "assembling", "in_transit", "ready_for_pickup", "done", "completed", "rejected", "cancelled"]
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def _get_seller_for_update(self, seller_id: int) -> Optional[Seller]:
        """Get seller with row-level lock for atomic updates."""
        result = await self.session.execute(
            select(Seller).where(Seller.seller_id == seller_id).with_for_update()
        )
        return result.scalar_one_or_none()
    
    def _validate_seller(self, seller: Optional[Seller], seller_id: int) -> None:
        """Validate seller exists and is not blocked."""
        if not seller:
            raise SellerNotFoundError(seller_id)
        if seller.is_blocked:
            raise SellerBlockedError(seller_id)
    
    async def create_order(
        self,
        buyer_id: int,
        seller_id: int,
        items_info: str,
        total_price: Decimal,
        delivery_type: str,
        address: Optional[str] = None,
        comment: Optional[str] = None,
        is_preorder: bool = False,
        preorder_delivery_date: Optional[date] = None,
    ) -> Order:
        """
        Create a new order with limit checks and seller lock.
        
        Args:
            buyer_id: Telegram ID of the buyer
            seller_id: Telegram ID of the seller
            items_info: Description of items
            total_price: Total order price
            delivery_type: Delivery method
            address: Delivery address (optional)
            
        Returns:
            Created Order object
            
        Raises:
            SellerNotFoundError: If seller doesn't exist
            SellerBlockedError: If seller is blocked
            SellerLimitReachedError: If seller has reached order limit
        """
        # Caller must commit the session after this returns.
        seller = await self._get_seller_for_update(seller_id)
        self._validate_seller(seller, seller_id)

        # Validate delivery type is supported by seller
        seller_setting = normalize_delivery_type_setting(seller.delivery_type)
        requested = normalize_delivery_type(delivery_type)
        if seller_setting and seller_setting != "both" and seller_setting != requested:
            raise OrderServiceError("Магазин не поддерживает выбранный способ доставки", 400)

        # Check seller subscription is active
        from backend.app.services.subscription import SubscriptionService
        sub_svc = SubscriptionService(self.session)
        if not await sub_svc.check_subscription(seller_id):
            raise OrderServiceError("Магазин временно не принимает заказы", 403)

        # Preorder orders do not consume daily limit slot
        if not is_preorder:
            seller_service = SellerService(self.session)
            if not seller_service.check_order_limit_for_seller(seller, delivery_type):
                raise SellerLimitReachedError(seller_id)
            dtype = normalize_delivery_type(delivery_type)
            if dtype == "delivery":
                seller.pending_delivery_requests = (seller.pending_delivery_requests or 0) + 1
            else:
                seller.pending_pickup_requests = (seller.pending_pickup_requests or 0) + 1
            seller.pending_requests += 1

        # НЕ уменьшаем количество товаров при создании заказа
        # Количество будет уменьшено только при принятии заказа продавцом (accept_order)

        # Create order
        order = Order(
            buyer_id=buyer_id,
            seller_id=seller_id,
            items_info=items_info,
            total_price=total_price,
            delivery_type=delivery_type,
            address=address,
            comment=comment,
            status="pending",
            is_preorder=is_preorder,
            preorder_delivery_date=preorder_delivery_date,
        )
        self.session.add(order)
        await self.session.flush()
        
        # Record metrics
        if orders_created_total:
            orders_created_total.labels(
                seller_id=str(seller_id),
                status="pending"
            ).inc()

        return order

    async def create_guest_order(
        self,
        seller_id: int,
        items_info: str,
        total_price: Decimal,
        delivery_type: str,
        address: Optional[str] = None,
        comment: Optional[str] = None,
        guest_name: str = "",
        guest_phone: str = "",
        guest_address: Optional[str] = None,
    ) -> Order:
        """
        Create a new order for a guest (no Telegram account).
        buyer_id is None; guest contact fields are stored on the order.
        """
        seller = await self._get_seller_for_update(seller_id)
        self._validate_seller(seller, seller_id)

        # Validate delivery type is supported by seller
        seller_setting = normalize_delivery_type_setting(seller.delivery_type)
        requested = normalize_delivery_type(delivery_type)
        if seller_setting and seller_setting != "both" and seller_setting != requested:
            raise OrderServiceError("Магазин не поддерживает выбранный способ доставки", 400)

        # Check seller subscription is active
        from backend.app.services.subscription import SubscriptionService
        sub_svc = SubscriptionService(self.session)
        if not await sub_svc.check_subscription(seller_id):
            raise OrderServiceError("Магазин временно не принимает заказы", 403)

        seller_service = SellerService(self.session)
        if not seller_service.check_order_limit_for_seller(seller, delivery_type):
            raise SellerLimitReachedError(seller_id)
        dtype = normalize_delivery_type(delivery_type)
        if dtype == "delivery":
            seller.pending_delivery_requests = (seller.pending_delivery_requests or 0) + 1
        else:
            seller.pending_pickup_requests = (seller.pending_pickup_requests or 0) + 1
        seller.pending_requests += 1

        order = Order(
            buyer_id=None,
            seller_id=seller_id,
            items_info=items_info,
            total_price=total_price,
            delivery_type=delivery_type,
            address=address,
            comment=comment,
            status="pending",
            guest_name=guest_name,
            guest_phone=guest_phone,
            guest_address=guest_address,
        )
        self.session.add(order)
        await self.session.flush()

        if orders_created_total:
            orders_created_total.labels(
                seller_id=str(seller_id),
                status="pending"
            ).inc()

        return order

    async def accept_order(self, order_id: int, verify_seller_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Accept a pending order. Moves counter from pending to active.
        Уменьшает количество товаров на складе.
        If verify_seller_id provided, ensures order belongs to that seller.
        Caller must commit the session after this returns.
        Returns dict with order info for notification purposes.
        """
        order = await self.session.get(Order, order_id)
        if not order:
            raise OrderNotFoundError(order_id)
        if verify_seller_id is not None and order.seller_id != verify_seller_id:
            raise OrderAccessDeniedError(order_id)

        if order.status != "pending":
            raise InvalidOrderStatusError(order_id, order.status, "pending")

        # Уменьшаем количество товаров при принятии заказа (для предзаказов не списываем — выполнение на дату поставки)
        is_preorder = getattr(order, "is_preorder", False)
        if not is_preorder:
            items_info_str = order.items_info or ""
            items_pattern = r'(\d+):(.+?)\s*[x×]\s*(\d+)'
            items_matches = re.findall(items_pattern, items_info_str)

            if items_matches:
                for product_id_str, product_name, quantity_str in items_matches:
                    product_id = int(product_id_str)
                    quantity_to_reduce = int(quantity_str)

                    # Получаем товар с блокировкой для атомарного обновления
                    product_result = await self.session.execute(
                        select(Product).where(
                            Product.id == product_id,
                            Product.seller_id == order.seller_id
                        ).with_for_update()
                    )
                    product = product_result.scalar_one_or_none()

                    if product:
                        # Проверяем доступное количество
                        if product.quantity < quantity_to_reduce:
                            raise OrderServiceError(
                                f"Недостаточно товара '{product.name}'. Доступно: {product.quantity}, запрошено: {quantity_to_reduce}",
                                400
                            )
                        # Если товар из букета — проверяем остатки в приёмках и списываем
                        if getattr(product, "bouquet_id", None):
                            err = await check_bouquet_stock(
                                self.session, order.seller_id, product.bouquet_id, quantity_to_reduce
                            )
                            if err:
                                raise OrderServiceError(err, 400)
                            await deduct_bouquet_from_receptions(
                                self.session, order.seller_id, product.bouquet_id, quantity_to_reduce
                            )
                        # Уменьшаем количество товара
                        product.quantity -= quantity_to_reduce

        # Lock and update seller counters (для предзаказа pending_requests не увеличивали при создании)
        seller = await self._get_seller_for_update(order.seller_id)
        dtype = normalize_delivery_type(order.delivery_type)
        if seller and seller.pending_requests > 0 and not is_preorder:
            seller.pending_requests -= 1
            if dtype == "delivery":
                seller.pending_delivery_requests = max(0, (seller.pending_delivery_requests or 0) - 1)
            else:
                seller.pending_pickup_requests = max(0, (seller.pending_pickup_requests or 0) - 1)
        if seller:
            seller.active_orders += 1
            if dtype == "delivery":
                seller.active_delivery_orders = (seller.active_delivery_orders or 0) + 1
            else:
                seller.active_pickup_orders = (seller.active_pickup_orders or 0) + 1

        order.status = "accepted"

        return {
            "order_id": order.id,
            "buyer_id": order.buyer_id,
            "seller_id": order.seller_id,
            "items_info": order.items_info,
            "total_price": float(order.total_price) if order.total_price is not None else 0.0,
            "new_status": "accepted"
        }
    
    async def reject_order(self, order_id: int, verify_seller_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Reject a pending order. Frees up pending slot.
        НЕ изменяет количество товаров на складе, так как сделка не состоялась.
        If verify_seller_id provided, ensures order belongs to that seller.
        Caller must commit the session after this returns.
        Returns dict with order info for notification purposes.
        """
        order = await self.session.get(Order, order_id)
        if not order:
            raise OrderNotFoundError(order_id)
        if verify_seller_id is not None and order.seller_id != verify_seller_id:
            raise OrderAccessDeniedError(order_id)

        if order.status != "pending":
            raise InvalidOrderStatusError(order_id, order.status, "pending")

        # НЕ уменьшаем количество товаров при отклонении заказа
        # Товары остаются доступными для других покупателей
        # Для предзаказа pending_requests не увеличивали при создании — не уменьшаем
        is_preorder = getattr(order, "is_preorder", False)
        seller = await self._get_seller_for_update(order.seller_id)
        dtype = normalize_delivery_type(order.delivery_type)
        if seller and seller.pending_requests > 0 and not is_preorder:
            seller.pending_requests -= 1
            if dtype == "delivery":
                seller.pending_delivery_requests = max(0, (seller.pending_delivery_requests or 0) - 1)
            else:
                seller.pending_pickup_requests = max(0, (seller.pending_pickup_requests or 0) - 1)

        order.status = "rejected"

        return {
            "order_id": order.id,
            "buyer_id": order.buyer_id,
            "seller_id": order.seller_id,
            "items_info": order.items_info,
            "total_price": float(order.total_price) if order.total_price is not None else 0.0,
            "new_status": "rejected"
        }
    
    async def cancel_order(self, order_id: int, buyer_id: int) -> Dict[str, Any]:
        """
        Cancel an order by the buyer.
        Allowed for any order in 'pending', 'accepted', or 'assembling' status.
        Refunds loyalty points if they were used.
        Restores product quantities for accepted/assembling orders (inventory already deducted).
        Returns dict with order info for notification purposes.
        """
        order = await self.session.get(Order, order_id)
        if not order:
            raise OrderNotFoundError(order_id)
        if order.buyer_id != buyer_id:
            raise OrderAccessDeniedError(order_id)
        if order.status not in ("pending", "accepted", "assembling"):
            raise InvalidOrderStatusError(order_id, order.status, "pending, accepted or assembling")

        old_status = order.status
        is_preorder = getattr(order, "is_preorder", False)

        # Update seller counters
        seller = await self._get_seller_for_update(order.seller_id)
        dtype = normalize_delivery_type(order.delivery_type)
        if old_status in ("accepted", "assembling") and seller and seller.active_orders > 0:
            seller.active_orders -= 1
            if dtype == "delivery":
                seller.active_delivery_orders = max(0, (seller.active_delivery_orders or 0) - 1)
            else:
                seller.active_pickup_orders = max(0, (seller.active_pickup_orders or 0) - 1)
        if old_status == "pending" and not is_preorder and seller and seller.pending_requests > 0:
            seller.pending_requests -= 1
            if dtype == "delivery":
                seller.pending_delivery_requests = max(0, (seller.pending_delivery_requests or 0) - 1)
            else:
                seller.pending_pickup_requests = max(0, (seller.pending_pickup_requests or 0) - 1)

        # Restore product quantities for accepted/assembling orders (stock was deducted at accept)
        if old_status in ("accepted", "assembling"):
            items_matches = re.findall(r'(\d+):(.+?)\s*[x\u00d7]\s*(\d+)', order.items_info or "")
            for product_id_str, _, quantity_str in items_matches:
                product_id = int(product_id_str)
                quantity = int(quantity_str)
                product_result = await self.session.execute(
                    select(Product).where(
                        Product.id == product_id,
                        Product.seller_id == order.seller_id
                    ).with_for_update()
                )
                product = product_result.scalar_one_or_none()
                if product and product.quantity is not None:
                    product.quantity += quantity

        # Refund loyalty points if used (with audit transaction)
        points_refunded = 0.0
        if order.points_used and float(order.points_used) > 0:
            loyalty_svc = LoyaltyService(self.session)
            # Find customer by buyer phone
            buyer = await self.session.get(User, buyer_id)
            if buyer and getattr(buyer, "phone", None):
                phone = normalize_phone(buyer.phone)
                customer = await loyalty_svc.find_customer_by_phone(order.seller_id, phone)
                if customer:
                    refund_amount = Decimal(str(order.points_used))
                    customer.points_balance = (customer.points_balance or Decimal("0")) + refund_amount
                    # Create audit transaction for the refund
                    from backend.app.models.loyalty import SellerLoyaltyTransaction
                    refund_tx = SellerLoyaltyTransaction(
                        seller_id=order.seller_id,
                        customer_id=customer.id,
                        order_id=order.id,
                        amount=Decimal("0"),
                        points_accrued=refund_amount,  # positive = points returned
                    )
                    self.session.add(refund_tx)
                    points_refunded = float(order.points_used)

        order.status = "cancelled"

        return {
            "order_id": order.id,
            "buyer_id": order.buyer_id,
            "seller_id": order.seller_id,
            "items_info": order.items_info,
            "total_price": float(order.total_price) if order.total_price is not None else 0.0,
            "new_status": "cancelled",
            "old_status": old_status,
            "is_preorder": is_preorder,
            "points_refunded": points_refunded,
        }

    async def complete_order(self, order_id: int) -> Dict[str, Any]:
        """
        Mark accepted order as done (by seller). Frees up active slot.
        Caller must commit the session after this returns.
        Returns dict with order info for notification purposes.
        """
        order = await self.session.get(Order, order_id)
        if not order:
            raise OrderNotFoundError(order_id)

        if order.status != "accepted":
            raise InvalidOrderStatusError(order_id, order.status, "accepted")

        # Lock and update seller counters
        seller = await self._get_seller_for_update(order.seller_id)
        dtype = normalize_delivery_type(order.delivery_type)
        if seller and seller.active_orders > 0:
            seller.active_orders -= 1
            if dtype == "delivery":
                seller.active_delivery_orders = max(0, (seller.active_delivery_orders or 0) - 1)
            else:
                seller.active_pickup_orders = max(0, (seller.active_pickup_orders or 0) - 1)

        order.status = "done"
        if order.completed_at is None:
            order.completed_at = datetime.utcnow()
        
        # Record metrics
        if orders_completed_total:
            orders_completed_total.labels(seller_id=str(order.seller_id)).inc()

        return {
            "order_id": order.id,
            "buyer_id": order.buyer_id,
            "seller_id": order.seller_id,
            "items_info": order.items_info,
            "total_price": float(order.total_price) if order.total_price is not None else 0.0,
            "new_status": "done"
        }
    
    async def update_status(
        self,
        order_id: int,
        new_status: str,
        verify_seller_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Update order status with proper counter management.
        Caller must commit the session after this returns.

        Args:
            order_id: Order ID
            new_status: Target status

        Returns:
            Dict with order info
        """
        if new_status not in self.VALID_STATUSES:
            raise OrderServiceError(
                f"Invalid status. Must be one of: {self.VALID_STATUSES}",
                400
            )

        order = await self.session.get(Order, order_id)
        if not order:
            raise OrderNotFoundError(order_id)
        if verify_seller_id is not None and order.seller_id != verify_seller_id:
            raise OrderAccessDeniedError(order_id)

        old_status = order.status

        # Block status progression if payment is required but not completed
        if new_status in ("assembling", "in_transit", "ready_for_pickup", "done"):
            if getattr(order, "payment_id", None) and getattr(order, "payment_status", None) != "succeeded":
                raise OrderServiceError(
                    "Невозможно изменить статус: заказ ещё не оплачен покупателем",
                    400,
                )

        order.status = new_status

        # Handle counter updates when order finishes
        if new_status == "done" and old_status in ["accepted", "assembling", "in_transit", "ready_for_pickup"]:
            seller = await self._get_seller_for_update(order.seller_id)
            dtype = normalize_delivery_type(order.delivery_type)
            if seller and seller.active_orders > 0:
                seller.active_orders -= 1
                if dtype == "delivery":
                    seller.active_delivery_orders = max(0, (seller.active_delivery_orders or 0) - 1)
                else:
                    seller.active_pickup_orders = max(0, (seller.active_pickup_orders or 0) - 1)
            if order.completed_at is None:
                order.completed_at = datetime.utcnow()

        if new_status == "completed" and order.completed_at is None:
            order.completed_at = datetime.utcnow()

        # Record metrics when buyer confirms receipt
        if new_status == "completed" and old_status != "completed":
            if orders_completed_total:
                orders_completed_total.labels(seller_id=str(order.seller_id)).inc()

        # Accrue loyalty points when order first reaches done or completed (by buyer phone)
        # Use original_price (before points/preorder discount) so customers aren't
        # penalised for using points — they earn on the full product value.
        if new_status in ("done", "completed") and old_status not in ("done", "completed"):
            buyer = await self.session.get(User, order.buyer_id) if order.buyer_id else None
            buyer_phone = buyer.phone if buyer else None
            if buyer_phone:
                accrual_amount = float(order.original_price or order.total_price or 0)
                loyalty_svc = LoyaltyService(self.session)
                await loyalty_svc.accrue_points_for_buyer_phone(
                    seller_id=order.seller_id,
                    buyer_phone=buyer_phone,
                    amount=accrual_amount,
                    order_id=order.id,
                )

        return {
            "order_id": order.id,
            "buyer_id": order.buyer_id,
            "seller_id": order.seller_id,
            "items_info": order.items_info,
            "total_price": float(order.total_price) if order.total_price is not None else 0.0,
            "old_status": old_status,
            "new_status": new_status,
        }
    
    async def get_seller_orders(
        self,
        seller_id: int,
        status: Optional[str] = None,
        preorder: Optional[bool] = None,
    ) -> List[Dict[str, Any]]:
        """Get orders for a seller with optional status and preorder filter. status can be comma-separated."""
        query = select(Order, User.fio, User.phone).outerjoin(
            User, Order.buyer_id == User.tg_id
        ).where(Order.seller_id == seller_id)

        if status:
            statuses = [s.strip() for s in status.split(",") if s.strip()]
            if statuses:
                query = query.where(Order.status.in_(statuses))
        if preorder is not None:
            query = query.where(Order.is_preorder == preorder)

        query = query.order_by(Order.created_at.desc())

        result = await self.session.execute(query)
        rows = result.all()

        # Batch lookup: collect unique phones and find matching loyalty customers
        phones = set()
        for row in rows:
            phone = row[2] or getattr(row[0], 'guest_phone', None)
            if phone:
                norm = normalize_phone(phone)
                if norm:
                    phones.add(norm)
        customer_by_phone: Dict[str, int] = {}
        if phones:
            from backend.app.models.loyalty import SellerCustomer
            cust_result = await self.session.execute(
                select(SellerCustomer.phone, SellerCustomer.id).where(
                    SellerCustomer.seller_id == seller_id,
                    SellerCustomer.phone.in_(phones),
                )
            )
            for cphone, cid in cust_result.all():
                customer_by_phone[cphone] = cid

        out = []
        for row in rows:
            o, buyer_fio, buyer_phone = row[0], row[1], row[2]
            # Fall back to guest fields for guest orders (buyer_id is None)
            effective_fio = buyer_fio or getattr(o, 'guest_name', None)
            effective_phone = buyer_phone or getattr(o, 'guest_phone', None)
            customer_id = None
            if effective_phone:
                norm = normalize_phone(effective_phone)
                customer_id = customer_by_phone.get(norm)
            out.append({
                "id": o.id,
                "buyer_id": o.buyer_id,
                "seller_id": o.seller_id,
                "items_info": o.items_info,
                "total_price": float(o.total_price),
                "original_price": float(o.original_price) if o.original_price is not None else None,
                "status": o.status,
                "delivery_type": o.delivery_type,
                "address": o.address,
                "created_at": o.created_at.isoformat() if o.created_at else None,
                "completed_at": o.completed_at.isoformat() if o.completed_at else None,
                "is_preorder": getattr(o, "is_preorder", False),
                "preorder_delivery_date": o.preorder_delivery_date.isoformat() if getattr(o, "preorder_delivery_date", None) else None,
                "buyer_fio": effective_fio,
                "buyer_phone": effective_phone,
                "customer_id": customer_id,
                "points_used": float(o.points_used) if getattr(o, "points_used", None) else 0,
                "points_discount": float(o.points_discount) if getattr(o, "points_discount", None) else 0,
                "is_guest": o.buyer_id is None,
                "payment_id": getattr(o, "payment_id", None),
                "payment_status": getattr(o, "payment_status", None),
            })
        return out

    async def get_seller_orders_by_buyer_phone(
        self, seller_id: int, customer_phone: str
    ) -> List[Dict[str, Any]]:
        """Get orders for seller where buyer's phone matches customer_phone (normalized)."""
        norm = normalize_phone(customer_phone or "")
        if not norm:
            return []
        result = await self.session.execute(
            select(User.tg_id, User.phone).where(User.phone.isnot(None))
        )
        rows = result.all()
        matching_tg_ids = [r[0] for r in rows if normalize_phone(r[1] or "") == norm]
        if not matching_tg_ids:
            return []
        query = (
            select(Order)
            .where(Order.seller_id == seller_id, Order.buyer_id.in_(matching_tg_ids))
            .order_by(Order.created_at.desc())
        )
        res = await self.session.execute(query)
        orders = res.scalars().all()
        return [
            {
                "id": o.id,
                "buyer_id": o.buyer_id,
                "seller_id": o.seller_id,
                "items_info": o.items_info,
                "total_price": float(o.total_price),
                "original_price": float(o.original_price) if o.original_price is not None else None,
                "status": o.status,
                "delivery_type": o.delivery_type,
                "address": o.address,
                "created_at": o.created_at.isoformat() if o.created_at else None,
                "completed_at": o.completed_at.isoformat() if o.completed_at else None,
                "is_preorder": getattr(o, "is_preorder", False),
                "preorder_delivery_date": o.preorder_delivery_date.isoformat() if getattr(o, "preorder_delivery_date", None) else None,
            }
            for o in orders
        ]

    async def get_seller_order_by_id(
        self, seller_id: int, order_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get one order by id for seller, with buyer fio, phone, and customer_id if loyalty customer."""
        result = await self.session.execute(
            select(Order, User.fio, User.phone)
            .outerjoin(User, Order.buyer_id == User.tg_id)
            .where(Order.id == order_id, Order.seller_id == seller_id)
        )
        row = result.one_or_none()
        if not row:
            return None
        order, buyer_fio, buyer_phone = row[0], row[1], row[2]
        effective_fio = buyer_fio or getattr(order, 'guest_name', None)
        effective_phone = buyer_phone or getattr(order, 'guest_phone', None)
        customer_id = None
        if effective_phone:
            loyalty_svc = LoyaltyService(self.session)
            customer = await loyalty_svc.find_customer_by_phone(seller_id, effective_phone)
            if customer:
                customer_id = customer.id
        return {
            "id": order.id,
            "buyer_id": order.buyer_id,
            "seller_id": order.seller_id,
            "items_info": order.items_info,
            "total_price": float(order.total_price),
            "original_price": float(order.original_price) if order.original_price is not None else None,
            "status": order.status,
            "delivery_type": order.delivery_type,
            "address": order.address,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "completed_at": order.completed_at.isoformat() if order.completed_at else None,
            "is_preorder": getattr(order, "is_preorder", False),
            "preorder_delivery_date": order.preorder_delivery_date.isoformat() if getattr(order, "preorder_delivery_date", None) else None,
            "buyer_fio": effective_fio,
            "buyer_phone": effective_phone,
            "customer_id": customer_id,
            "points_used": float(order.points_used) if getattr(order, "points_used", None) else 0,
            "points_discount": float(order.points_discount) if getattr(order, "points_discount", None) else 0,
            "is_guest": order.buyer_id is None,
        }

    async def get_buyer_orders(self, buyer_id: int) -> List[Dict[str, Any]]:
        """Get orders for a buyer, enriched with shop_name, seller_username, first product photo."""
        query = (
            select(Order, Seller.shop_name, User.username, Seller.address_name, Seller.map_url)
            .outerjoin(Seller, Order.seller_id == Seller.seller_id)
            .outerjoin(User, Order.seller_id == User.tg_id)
            .where(Order.buyer_id == buyer_id)
            .order_by(Order.created_at.desc())
        )

        result = await self.session.execute(query)
        rows = result.all()

        # Parse items_info to extract first product_id per order for photo lookup
        items_pattern = re.compile(r'(\d+):(.+?)\s*[x\u00d7]\s*(\d+)')
        order_first_pid: Dict[int, int] = {}
        all_product_ids: set = set()

        for row in rows:
            o = row[0]
            matches = items_pattern.findall(o.items_info or "")
            if matches:
                first_pid = int(matches[0][0])
                order_first_pid[o.id] = first_pid
                for m in matches:
                    all_product_ids.add(int(m[0]))

        # Batch fetch product photos
        product_photos: Dict[int, Optional[str]] = {}
        if all_product_ids:
            photos_result = await self.session.execute(
                select(Product.id, Product.photo_id).where(Product.id.in_(all_product_ids))
            )
            for pid, photo_id in photos_result.all():
                product_photos[pid] = photo_id

        return [
            {
                "id": row[0].id,
                "buyer_id": row[0].buyer_id,
                "seller_id": row[0].seller_id,
                "items_info": row[0].items_info,
                "total_price": float(row[0].total_price),
                "status": row[0].status,
                "delivery_type": row[0].delivery_type,
                "address": row[0].address,
                "created_at": row[0].created_at.isoformat() if row[0].created_at else None,
                "is_preorder": getattr(row[0], "is_preorder", False),
                "preorder_delivery_date": (
                    row[0].preorder_delivery_date.isoformat()
                    if getattr(row[0], "preorder_delivery_date", None)
                    else None
                ),
                "shop_name": row.shop_name or "Магазин",
                "seller_username": row.username,
                "first_product_photo": product_photos.get(order_first_pid.get(row[0].id)),
                "seller_address_name": row.address_name,
                "seller_map_url": row.map_url,
                "payment_id": getattr(row[0], "payment_id", None),
                "payment_status": getattr(row[0], "payment_status", None),
            }
            for row in rows
        ]
    
    async def update_order_price(self, order_id: int, new_price: Decimal, verify_seller_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Изменить цену заказа. Можно изменить для заказов со статусом 'pending' (до принятия)
        или 'accepted'. При первом изменении сохраняет original_price.
        If verify_seller_id provided, ensures order belongs to that seller.
        Caller must commit the session after this returns.
        Returns dict with order_id, buyer_id, total_price, original_price.
        """
        order = await self.session.get(Order, order_id)
        if not order:
            raise OrderNotFoundError(order_id)
        if verify_seller_id is not None and order.seller_id != verify_seller_id:
            raise OrderAccessDeniedError(order_id)

        if order.status not in ("pending", "accepted"):
            raise InvalidOrderStatusError(order_id, order.status, "pending or accepted")

        # Invalidate existing payment if price changes (old payment has wrong amount)
        if order.payment_id and order.payment_status in ("pending", "waiting_for_capture"):
            logger.info(
                "Invalidating payment due to price change",
                order_id=order_id,
                old_payment_id=order.payment_id,
            )
            order.payment_id = None
            order.payment_status = None

        # При первом изменении сохраняем исходную цену
        if order.original_price is None:
            order.original_price = order.total_price

        order.total_price = new_price

        total = float(order.total_price) if order.total_price is not None else 0.0
        orig = float(order.original_price) if order.original_price is not None else total
        return {
            "order_id": order.id,
            "buyer_id": order.buyer_id,
            "seller_id": order.seller_id,
            "total_price": total,
            "original_price": orig,
            "items_info": order.items_info or "",
        }

    COMPLETED_ORDER_STATUSES = ("done", "completed")

    async def get_seller_stats(
        self,
        seller_id: int,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Get order statistics for a seller with optional period filters."""
        date_field = func.coalesce(Order.completed_at, Order.created_at)
        end_exclusive = date_to + timedelta(days=1) if date_to else None

        base_conditions = [Order.seller_id == seller_id]
        if date_from:
            base_conditions.append(date_field >= date_from)
        if end_exclusive:
            base_conditions.append(date_field < end_exclusive)

        completed_conditions = base_conditions + [Order.status.in_(self.COMPLETED_ORDER_STATUSES)]

        # Revenue from completed orders
        totals_stmt = (
            select(
                func.count(Order.id).label("total_orders"),
                func.coalesce(func.sum(Order.total_price), 0).label("total_revenue"),
            )
            .where(*completed_conditions)
        )
        totals_row = (await self.session.execute(totals_stmt)).one()
        total_orders = totals_row.total_orders or 0
        total_revenue = float(totals_row.total_revenue or 0)
        # Read commission rate: per-seller override > GlobalSettings > default (3%)
        from backend.app.services.commissions import get_effective_commission_rate
        _eff_pct = await get_effective_commission_rate(self.session, seller_id)
        commission_rate = _eff_pct / 100
        commission = float(Decimal(str(total_revenue * commission_rate)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

        # Orders by status (any status)
        status_stmt = (
            select(Order.status, func.count(Order.id).label("count"))
            .where(*base_conditions)
            .group_by(Order.status)
        )
        status_counts = {
            row.status: row.count
            for row in (await self.session.execute(status_stmt)).all()
        }

        # Daily sales for chart
        daily_stmt = (
            select(
                func.date(date_field).label("day"),
                func.count(Order.id).label("orders_count"),
                func.coalesce(func.sum(Order.total_price), 0).label("revenue_sum"),
            )
            .where(*completed_conditions)
            .group_by(func.date(date_field))
            .order_by(func.date(date_field))
        )
        daily_rows = (await self.session.execute(daily_stmt)).all()
        daily_map: Dict[date, Dict[str, float]] = {}
        for row in daily_rows:
            day_val = row.day
            if isinstance(day_val, str):
                day_val = date.fromisoformat(day_val)
            daily_map[day_val] = {
                "orders": row.orders_count or 0,
                "revenue": float(row.revenue_sum or 0),
            }

        # Fill missing days within the selected range
        daily_series: List[Dict[str, Any]] = []
        if daily_map:
            start_day = date_from.date() if date_from else min(daily_map.keys())
            end_day = date_to.date() if date_to else max(daily_map.keys())
            current = start_day
            while current <= end_day:
                point = daily_map.get(current, {"orders": 0, "revenue": 0.0})
                daily_series.append(
                    {
                        "date": current.isoformat(),
                        "orders": point["orders"],
                        "revenue": round(point["revenue"], 2),
                    },
                )
                current += timedelta(days=1)
        elif date_from and date_to:
            current = date_from.date()
            end_day = date_to.date()
            while current <= end_day:
                daily_series.append(
                    {
                        "date": current.isoformat(),
                        "orders": 0,
                        "revenue": 0.0,
                    }
                )
                current += timedelta(days=1)

        # Delivery vs pickup breakdown
        delivery_stmt = (
            select(
                Order.delivery_type,
                func.count(Order.id).label("orders_count"),
                func.coalesce(func.sum(Order.total_price), 0).label("revenue_sum"),
            )
            .where(*completed_conditions)
            .group_by(Order.delivery_type)
        )
        delivery_rows = (await self.session.execute(delivery_stmt)).all()

        def _normalize_delivery_type(value: Optional[str]) -> str:
            if not value:
                return "unknown"
            normalized = value.strip().lower()
            if normalized in {"delivery", "доставка"}:
                return "delivery"
            if normalized in {"pickup", "самовывоз"}:
                return "pickup"
            return "other"

        delivery_breakdown: Dict[str, Dict[str, float]] = {
            "delivery": {"orders": 0, "revenue": 0.0},
            "pickup": {"orders": 0, "revenue": 0.0},
            "other": {"orders": 0, "revenue": 0.0},
            "unknown": {"orders": 0, "revenue": 0.0},
        }
        for row in delivery_rows:
            bucket = _normalize_delivery_type(row.delivery_type)
            delivery_breakdown[bucket]["orders"] += row.orders_count or 0
            delivery_breakdown[bucket]["revenue"] += float(row.revenue_sum or 0)

        for bucket in delivery_breakdown.values():
            bucket["revenue"] = round(bucket["revenue"], 2)

        average_check = round(total_revenue / total_orders, 2) if total_orders else 0

        previous_period_orders = 0
        previous_period_revenue = 0.0
        if date_from and date_to:
            period_days = (date_to.date() - date_from.date()).days + 1
            prev_end = date_from - timedelta(days=1)
            prev_start = prev_end - timedelta(days=period_days - 1)
            prev_conditions = [
                Order.seller_id == seller_id,
                Order.status.in_(self.COMPLETED_ORDER_STATUSES),
                date_field >= prev_start,
                date_field < prev_end + timedelta(days=1),
            ]
            prev_stmt = (
                select(
                    func.count(Order.id).label("total_orders"),
                    func.coalesce(func.sum(Order.total_price), 0).label("total_revenue"),
                )
                .where(*prev_conditions)
            )
            prev_row = (await self.session.execute(prev_stmt)).one()
            previous_period_orders = prev_row.total_orders or 0
            previous_period_revenue = float(prev_row.total_revenue or 0)

        # Top products and bouquets from items_info (completed orders in period)
        top_products: List[Dict[str, Any]] = []
        top_bouquets: List[Dict[str, Any]] = []
        items_pattern = re.compile(r"(\d+):(.+?)\s*[x×]\s*(\d+)")
        orders_items_stmt = select(Order.items_info).where(*completed_conditions)
        orders_items_result = await self.session.execute(orders_items_stmt)
        product_agg: Dict[int, Dict[str, Any]] = {}
        for (items_info_str,) in orders_items_result.all():
            if not items_info_str:
                continue
            products_in_order: set = set()
            for m in items_pattern.finditer(items_info_str):
                product_id = int(m.group(1))
                product_name = (m.group(2) or "").strip()
                qty = int(m.group(3) or 0)
                if product_id not in product_agg:
                    product_agg[product_id] = {"product_id": product_id, "product_name": product_name, "quantity_sold": 0, "order_count": 0}
                product_agg[product_id]["quantity_sold"] += qty
                products_in_order.add(product_id)
            for pid in products_in_order:
                product_agg[pid]["order_count"] += 1
        if product_agg:
            product_ids = list(product_agg.keys())
            products_result = await self.session.execute(
                select(Product.id, Product.bouquet_id).where(
                    Product.seller_id == seller_id, Product.id.in_(product_ids)
                )
            )
            product_to_bouquet: Dict[int, Optional[int]] = {row[0]: row[1] for row in products_result.all()}
            top_products = sorted(
                [
                    {
                        "product_id": p["product_id"],
                        "product_name": p["product_name"] or f"Товар #{p['product_id']}",
                        "quantity_sold": p["quantity_sold"],
                        "order_count": p["order_count"],
                    }
                    for p in product_agg.values()
                ],
                key=lambda x: (-x["quantity_sold"], -x["order_count"]),
            )[:10]
            bouquet_agg: Dict[int, int] = {}
            for pid, pdata in product_agg.items():
                bid = product_to_bouquet.get(pid)
                if bid is not None:
                    bouquet_agg[bid] = bouquet_agg.get(bid, 0) + pdata["quantity_sold"]
            if bouquet_agg:
                bouquet_ids = list(bouquet_agg.keys())
                bouquets_result = await self.session.execute(
                    select(Bouquet.id, Bouquet.name).where(
                        Bouquet.seller_id == seller_id, Bouquet.id.in_(bouquet_ids)
                    )
                )
                bouquet_names = {row[0]: row[1] for row in bouquets_result.all()}
                top_bouquets = sorted(
                    [
                        {
                            "bouquet_id": bid,
                            "bouquet_name": bouquet_names.get(bid) or f"Букет #{bid}",
                            "quantity_sold": qty,
                        }
                        for bid, qty in bouquet_agg.items()
                    ],
                    key=lambda x: -x["quantity_sold"],
                )[:10]

        return {
            "total_completed_orders": total_orders,
            "total_revenue": round(total_revenue, 2),
            "commission_rate": round(commission_rate * 100),
            "commission_amount": commission,
            "net_revenue": round(total_revenue - commission, 2),
            "average_check": average_check,
            "orders_by_status": status_counts,
            "daily_sales": daily_series,
            "delivery_breakdown": delivery_breakdown,
            "previous_period_orders": previous_period_orders,
            "previous_period_revenue": round(previous_period_revenue, 2),
            "top_products": top_products,
            "top_bouquets": top_bouquets,
            "filters": {
                "date_from": date_from.date().isoformat() if date_from else None,
                "date_to": date_to.date().isoformat() if date_to else None,
            },
        }

    async def get_customer_stats(
        self,
        seller_id: int,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Customer metrics for a seller within a date range."""
        date_field = func.coalesce(Order.completed_at, Order.created_at)
        end_exclusive = date_to + timedelta(days=1) if date_to else None

        base = [Order.seller_id == seller_id, Order.status.in_(self.COMPLETED_ORDER_STATUSES), Order.buyer_id.isnot(None)]
        period_conds = list(base)
        if date_from:
            period_conds.append(date_field >= date_from)
        if end_exclusive:
            period_conds.append(date_field < end_exclusive)

        # -- buyer_id list in current period --
        period_buyers_stmt = (
            select(Order.buyer_id)
            .where(*period_conds)
            .group_by(Order.buyer_id)
        )
        period_buyer_rows = (await self.session.execute(period_buyers_stmt)).all()
        period_buyer_ids = {r[0] for r in period_buyer_rows}
        total_customers = len(period_buyer_ids)

        # -- new vs returning: buyers whose FIRST completed order falls in the period --
        first_order_subq = (
            select(Order.buyer_id, func.min(date_field).label("first_date"))
            .where(Order.seller_id == seller_id, Order.status.in_(self.COMPLETED_ORDER_STATUSES))
            .group_by(Order.buyer_id)
            .subquery()
        )
        new_buyers_conds = [first_order_subq.c.buyer_id.in_(period_buyer_ids)]
        if date_from:
            new_buyers_conds.append(first_order_subq.c.first_date >= date_from)
        if end_exclusive:
            new_buyers_conds.append(first_order_subq.c.first_date < end_exclusive)
        new_buyers_stmt = select(func.count()).select_from(first_order_subq).where(*new_buyers_conds)
        new_customers = (await self.session.execute(new_buyers_stmt)).scalar() or 0
        returning_customers = total_customers - new_customers

        # -- repeat purchases: orders from returning customers in the period --
        repeat_orders = 0
        if returning_customers > 0 and period_buyer_ids:
            all_new_ids_stmt = (
                select(first_order_subq.c.buyer_id)
                .where(*new_buyers_conds)
            )
            new_ids_rows = (await self.session.execute(all_new_ids_stmt)).all()
            new_ids = {r[0] for r in new_ids_rows}
            returning_ids = period_buyer_ids - new_ids
            if returning_ids:
                repeat_stmt = (
                    select(func.count(Order.id))
                    .where(*period_conds, Order.buyer_id.in_(returning_ids))
                )
                repeat_orders = (await self.session.execute(repeat_stmt)).scalar() or 0

        # -- retention rate: % of prev period buyers who bought in this period --
        retention_rate = 0.0
        if date_from and date_to:
            period_days = (date_to.date() - date_from.date()).days + 1
            prev_end = date_from - timedelta(days=1)
            prev_start = prev_end - timedelta(days=period_days - 1)
            prev_conds = [
                Order.seller_id == seller_id,
                Order.status.in_(self.COMPLETED_ORDER_STATUSES),
                date_field >= prev_start,
                date_field < prev_end + timedelta(days=1),
            ]
            prev_buyers_stmt = (
                select(Order.buyer_id).where(*prev_conds).group_by(Order.buyer_id)
            )
            prev_rows = (await self.session.execute(prev_buyers_stmt)).all()
            prev_buyer_ids = {r[0] for r in prev_rows}
            if prev_buyer_ids:
                retained = prev_buyer_ids & period_buyer_ids
                retention_rate = round(len(retained) / len(prev_buyer_ids) * 100, 1)

        # -- average LTV: total revenue per buyer (all time) --
        buyer_totals_sq = (
            select(
                Order.buyer_id,
                func.sum(Order.total_price).label("buyer_total"),
            )
            .where(Order.seller_id == seller_id, Order.status.in_(self.COMPLETED_ORDER_STATUSES))
            .group_by(Order.buyer_id)
            .subquery()
        )
        ltv_stmt = select(func.avg(buyer_totals_sq.c.buyer_total)).select_from(buyer_totals_sq)
        avg_ltv_raw = (await self.session.execute(ltv_stmt)).scalar()
        avg_ltv = round(float(avg_ltv_raw or 0), 2)

        # -- top 5 customers by revenue in period --
        top_stmt = (
            select(
                Order.buyer_id,
                func.count(Order.id).label("orders_count"),
                func.coalesce(func.sum(Order.total_price), 0).label("total_spent"),
            )
            .where(*period_conds)
            .group_by(Order.buyer_id)
            .order_by(func.sum(Order.total_price).desc())
            .limit(5)
        )
        top_rows = (await self.session.execute(top_stmt)).all()
        top_customers: List[Dict[str, Any]] = []
        if top_rows:
            buyer_ids = [r.buyer_id for r in top_rows]
            users_stmt = select(User.tg_id, User.fio, User.phone).where(User.tg_id.in_(buyer_ids))
            users_rows = (await self.session.execute(users_stmt)).all()
            users_map = {u.tg_id: {"fio": u.fio, "phone": u.phone} for u in users_rows}
            for r in top_rows:
                u = users_map.get(r.buyer_id, {})
                top_customers.append({
                    "buyer_id": r.buyer_id,
                    "name": u.get("fio") or f"Покупатель #{r.buyer_id}",
                    "phone": u.get("phone") or "",
                    "orders_count": r.orders_count or 0,
                    "total_spent": round(float(r.total_spent or 0), 2),
                })

        return {
            "total_customers": total_customers,
            "new_customers": new_customers,
            "returning_customers": returning_customers,
            "repeat_orders": repeat_orders,
            "retention_rate": retention_rate,
            "avg_ltv": avg_ltv,
            "top_customers": top_customers,
        }

    async def get_platform_daily_stats(
        self,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Platform-wide daily sales for admin chart (completed orders only)."""
        date_field = func.coalesce(Order.completed_at, Order.created_at)
        end_exclusive = date_to + timedelta(days=1) if date_to else None

        conditions = [Order.status.in_(self.COMPLETED_ORDER_STATUSES)]
        if date_from:
            conditions.append(date_field >= date_from)
        if end_exclusive:
            conditions.append(date_field < end_exclusive)

        daily_stmt = (
            select(
                func.date(date_field).label("day"),
                func.count(Order.id).label("orders_count"),
                func.coalesce(func.sum(Order.total_price), 0).label("revenue_sum"),
            )
            .where(*conditions)
            .group_by(func.date(date_field))
            .order_by(func.date(date_field))
        )
        daily_rows = (await self.session.execute(daily_stmt)).all()
        daily_map: Dict[date, Dict[str, float]] = {}
        for row in daily_rows:
            day_val = row.day
            if isinstance(day_val, str):
                day_val = date.fromisoformat(day_val)
            daily_map[day_val] = {
                "orders": row.orders_count or 0,
                "revenue": float(row.revenue_sum or 0),
            }

        daily_series: List[Dict[str, Any]] = []
        if daily_map:
            start_day = date_from.date() if date_from else min(daily_map.keys())
            end_day = date_to.date() if date_to else max(daily_map.keys())
            current = start_day
            while current <= end_day:
                point = daily_map.get(current, {"orders": 0, "revenue": 0.0})
                daily_series.append({
                    "date": current.isoformat(),
                    "orders": point["orders"],
                    "revenue": round(point["revenue"], 2),
                })
                current += timedelta(days=1)
        elif date_from and date_to:
            current = date_from.date()
            end_day = date_to.date()
            while current <= end_day:
                daily_series.append({
                    "date": current.isoformat(),
                    "orders": 0,
                    "revenue": 0.0,
                })
                current += timedelta(days=1)

        return {"daily_sales": daily_series}

    async def get_preorder_summary(self, seller_id: int, target_date: date) -> Dict[str, Any]:
        """Get aggregated preorder summary for a specific delivery date.

        Returns product breakdown with quantities for procurement planning.
        """
        result = await self.session.execute(
            select(Order).where(
                Order.seller_id == seller_id,
                Order.is_preorder.is_(True),
                Order.preorder_delivery_date == target_date,
                Order.status.notin_(["rejected", "cancelled"]),
            )
        )
        orders = list(result.scalars().all())
        if not orders:
            return {
                "date": target_date.isoformat(),
                "orders_count": 0,
                "total_amount": 0.0,
                "products": [],
            }

        total_amount = sum(float(o.total_price or 0) for o in orders)
        items_pattern = re.compile(r'(\d+):(.+?)\s*[x×]\s*(\d+)')

        # Aggregate products
        product_totals: Dict[int, Dict[str, Any]] = {}
        for order in orders:
            for pid_str, pname, qty_str in items_pattern.findall(order.items_info or ""):
                pid = int(pid_str)
                qty = int(qty_str)
                if pid not in product_totals:
                    product_totals[pid] = {"product_id": pid, "name": pname.strip(), "total_quantity": 0, "order_count": 0}
                product_totals[pid]["total_quantity"] += qty
                product_totals[pid]["order_count"] += 1

        # Enrich with bouquet flower breakdown
        product_ids = list(product_totals.keys())
        if product_ids:
            products_result = await self.session.execute(
                select(Product).where(Product.id.in_(product_ids))
            )
            products_map = {p.id: p for p in products_result.scalars().all()}
            for pid, info in product_totals.items():
                product = products_map.get(pid)
                if product and getattr(product, "bouquet_id", None):
                    info["bouquet_id"] = product.bouquet_id

        products_list = sorted(product_totals.values(), key=lambda x: x["total_quantity"], reverse=True)

        return {
            "date": target_date.isoformat(),
            "orders_count": len(orders),
            "total_amount": round(total_amount, 2),
            "products": products_list,
        }

    async def get_preorder_analytics(
        self,
        seller_id: int,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Get preorder-specific analytics for seller stats dashboard."""
        base = select(Order).where(
            Order.seller_id == seller_id,
            Order.is_preorder.is_(True),
        )
        if date_from:
            base = base.where(Order.created_at >= date_from)
        if date_to:
            base = base.where(Order.created_at <= date_to)
        result = await self.session.execute(base)
        preorders = list(result.scalars().all())

        if not preorders:
            return {
                "total_preorders": 0,
                "completed_preorders": 0,
                "cancelled_preorders": 0,
                "total_revenue": 0.0,
                "avg_lead_days": 0,
                "completion_rate": 0.0,
                "cancellation_rate": 0.0,
                "top_products": [],
            }

        total = len(preorders)
        completed = [o for o in preorders if o.status in ("done", "completed")]
        cancelled = [o for o in preorders if o.status == "cancelled"]
        revenue = sum(float(o.total_price or 0) for o in completed)

        # Average lead time (days between order creation and delivery date)
        lead_days = []
        for o in preorders:
            if o.preorder_delivery_date and o.created_at:
                delta = (o.preorder_delivery_date - o.created_at.date()).days
                if delta >= 0:
                    lead_days.append(delta)
        avg_lead = round(sum(lead_days) / len(lead_days), 1) if lead_days else 0

        return {
            "total_preorders": total,
            "completed_preorders": len(completed),
            "cancelled_preorders": len(cancelled),
            "total_revenue": round(revenue, 2),
            "avg_lead_days": avg_lead,
            "completion_rate": round(len(completed) / total * 100, 1) if total else 0,
            "cancellation_rate": round(len(cancelled) / total * 100, 1) if total else 0,
        }


async def activate_due_preorders(session: AsyncSession, today: date) -> List[Dict[str, Any]]:
    """
    Find all preorders with status 'accepted' whose preorder_delivery_date == today
    and transition them to 'assembling' (active orders).

    Returns list of transitioned order dicts for notification purposes.
    Caller must commit the session after this returns.
    """
    from backend.app.core.logging import get_logger
    _log = get_logger("flurai.preorder_activator")

    result = await session.execute(
        select(Order).where(
            Order.is_preorder.is_(True),
            Order.status == "accepted",
            Order.preorder_delivery_date == today,
        )
    )
    orders = result.scalars().all()

    if not orders:
        return []

    activated: List[Dict[str, Any]] = []
    for order in orders:
        try:
            old_status = order.status
            order.status = "assembling"
            activated.append({
                "order_id": order.id,
                "buyer_id": order.buyer_id,
                "seller_id": order.seller_id,
                "items_info": order.items_info,
                "total_price": float(order.total_price) if order.total_price is not None else 0.0,
                "old_status": old_status,
                "new_status": "assembling",
            })
        except Exception as e:
            _log.error(
                "Failed to activate preorder",
                order_id=order.id,
                error=str(e),
            )

    _log.info("Preorder activation complete", today=str(today), activated=len(activated))
    return activated


# Legacy functions for backward compatibility
async def create_new_order(session: AsyncSession, order_data: dict):
    """
    Legacy function - use OrderService.create_order instead.
    """
    service = OrderService(session)
    return await service.create_order(
        buyer_id=order_data['buyer_id'],
        seller_id=order_data['seller_id'],
        items_info=order_data['items_info'],
        total_price=order_data['total_price'],
        delivery_type=order_data.get('delivery_type'),
        address=order_data.get('address')
    )