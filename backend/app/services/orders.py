# backend/app/services/orders.py
"""
Order service - handles all order-related business logic.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List, Dict, Any
from decimal import Decimal
from datetime import datetime, timedelta, date
import re

from backend.app.models.order import Order
from backend.app.models.seller import Seller
from backend.app.models.product import Product
from backend.app.models.user import User
from backend.app.services.sellers import SellerService
from backend.app.services.bouquets import check_bouquet_stock, deduct_bouquet_from_receptions
from backend.app.services.loyalty import LoyaltyService


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
    
    VALID_STATUSES = ["pending", "accepted", "assembling", "in_transit", "done", "completed", "rejected"]
    
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
        agent_id: Optional[int] = None,
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
            agent_id: Referral agent ID (optional)
            
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
        seller_service = SellerService(self.session)
        if not await seller_service.check_limit(seller_id):
            raise SellerLimitReachedError(seller_id)

        # НЕ уменьшаем количество товаров при создании заказа
        # Количество будет уменьшено только при принятии заказа продавцом (accept_order)

        # Increment pending counter
        seller.pending_requests += 1

        # Create order
        order = Order(
            buyer_id=buyer_id,
            seller_id=seller_id,
            items_info=items_info,
            total_price=total_price,
            delivery_type=delivery_type,
            address=address,
            agent_id=agent_id,
            status="pending"
        )
        self.session.add(order)
        await self.session.flush()

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

        # Уменьшаем количество товаров при принятии заказа
        # Формат items_info: "ID:название x количество" или "ID:название × количество"
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

        # Lock and update seller counters
        seller = await self._get_seller_for_update(order.seller_id)
        if seller and seller.pending_requests > 0:
            seller.pending_requests -= 1
        if seller:
            seller.active_orders += 1

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

        # Lock and update seller counters
        seller = await self._get_seller_for_update(order.seller_id)
        if seller and seller.pending_requests > 0:
            seller.pending_requests -= 1

        order.status = "rejected"

        return {
            "order_id": order.id,
            "buyer_id": order.buyer_id,
            "seller_id": order.seller_id,
            "items_info": order.items_info,
            "total_price": float(order.total_price) if order.total_price is not None else 0.0,
            "new_status": "rejected"
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
        if seller and seller.active_orders > 0:
            seller.active_orders -= 1

        order.status = "done"
        if order.completed_at is None:
            order.completed_at = datetime.utcnow()

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
        accrue_commissions_func=None
    ) -> Dict[str, Any]:
        """
        Update order status with proper counter management.
        Caller must commit the session after this returns.
        
        Args:
            order_id: Order ID
            new_status: Target status
            accrue_commissions_func: Optional async function to call when status becomes 'completed'
            
        Returns:
            Dict with order info and commission details if applicable
        """
        if new_status not in self.VALID_STATUSES:
            raise OrderServiceError(
                f"Invalid status. Must be one of: {self.VALID_STATUSES}",
                400
            )

        commissions_accrued = []

        order = await self.session.get(Order, order_id)
        if not order:
            raise OrderNotFoundError(order_id)
        if verify_seller_id is not None and order.seller_id != verify_seller_id:
            raise OrderAccessDeniedError(order_id)

        old_status = order.status
        order.status = new_status

        # Handle counter updates when order finishes
        if new_status == "done" and old_status in ["accepted", "assembling", "in_transit"]:
            seller = await self._get_seller_for_update(order.seller_id)
            if seller and seller.active_orders > 0:
                seller.active_orders -= 1
            if order.completed_at is None:
                order.completed_at = datetime.utcnow()

        if new_status == "completed" and order.completed_at is None:
            order.completed_at = datetime.utcnow()

        # Accrue commissions when buyer confirms receipt
        if new_status == "completed" and old_status != "completed" and accrue_commissions_func:
            commissions_accrued = await accrue_commissions_func(
                session=self.session,
                order_total=float(order.total_price or 0),
                buyer_id=order.buyer_id
            )

        # Accrue loyalty points when order first reaches done or completed (by buyer phone)
        if new_status in ("done", "completed") and old_status not in ("done", "completed"):
            buyer = await self.session.get(User, order.buyer_id)
            buyer_phone = buyer.phone if buyer else None
            if buyer_phone:
                loyalty_svc = LoyaltyService(self.session)
                await loyalty_svc.accrue_points_for_buyer_phone(
                    seller_id=order.seller_id,
                    buyer_phone=buyer_phone,
                    amount=float(order.total_price or 0),
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
            "commissions_accrued": commissions_accrued
        }
    
    async def get_seller_orders(
        self,
        seller_id: int,
        status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get orders for a seller with optional status filter. status can be comma-separated for multiple."""
        query = select(Order).where(Order.seller_id == seller_id)
        
        if status:
            statuses = [s.strip() for s in status.split(",") if s.strip()]
            if statuses:
                query = query.where(Order.status.in_(statuses))
        
        query = query.order_by(Order.created_at.desc())
        
        result = await self.session.execute(query)
        orders = result.scalars().all()
        
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
            }
            for o in orders
        ]
    
    async def get_buyer_orders(self, buyer_id: int) -> List[Dict[str, Any]]:
        """Get orders for a buyer."""
        query = (
            select(Order)
            .where(Order.buyer_id == buyer_id)
            .order_by(Order.created_at.asc())
        )
        
        result = await self.session.execute(query)
        orders = result.scalars().all()
        
        return [
            {
                "id": o.id,
                "buyer_id": o.buyer_id,
                "seller_id": o.seller_id,
                "items_info": o.items_info,
                "total_price": float(o.total_price),
                "status": o.status,
                "delivery_type": o.delivery_type,
                "address": o.address,
                "created_at": o.created_at.isoformat() if o.created_at else None
            }
            for o in orders
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

        # При первом изменении сохраняем исходную цену
        if order.original_price is None:
            order.original_price = order.total_price

        order.total_price = new_price

        total = float(order.total_price) if order.total_price is not None else 0.0
        orig = float(order.original_price) if order.original_price is not None else total
        return {
            "order_id": order.id,
            "buyer_id": order.buyer_id,
            "total_price": total,
            "original_price": orig,
        }

    COMPLETED_ORDER_STATUSES = ("done", "completed", "delivered")

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
        commission = round(total_revenue * 0.18, 2)  # 18% platform commission

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
        daily_map: Dict[date, Dict[str, float]] = {
            row.day: {
                "orders": row.orders_count or 0,
                "revenue": float(row.revenue_sum or 0),
            }
            for row in daily_rows
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

        return {
            "total_completed_orders": total_orders,
            "total_revenue": round(total_revenue, 2),
            "commission_18": commission,
            "net_revenue": round(total_revenue - commission, 2),
            "orders_by_status": status_counts,
            "daily_sales": daily_series,
            "delivery_breakdown": delivery_breakdown,
            "filters": {
                "date_from": date_from.date().isoformat() if date_from else None,
                "date_to": date_to.date().isoformat() if date_to else None,
            },
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
        daily_map: Dict[date, Dict[str, float]] = {
            row.day: {
                "orders": row.orders_count or 0,
                "revenue": float(row.revenue_sum or 0),
            }
            for row in daily_rows
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
        address=order_data.get('address'),
        agent_id=order_data.get('agent_id')
    )