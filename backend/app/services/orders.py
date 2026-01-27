# backend/app/services/orders.py
"""
Order service - handles all order-related business logic.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List, Dict, Any
from decimal import Decimal

from backend.app.models.order import Order
from backend.app.models.seller import Seller


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
    
    def _check_limits(self, seller: Seller) -> None:
        """Check if seller can accept new orders."""
        current_load = seller.active_orders + seller.pending_requests
        if current_load >= seller.max_orders:
            raise SellerLimitReachedError(seller.seller_id)
    
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
        async with self.session.begin():
            # Lock seller row for atomic update
            seller = await self._get_seller_for_update(seller_id)
            self._validate_seller(seller, seller_id)
            self._check_limits(seller)
            
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
    
    async def accept_order(self, order_id: int) -> Dict[str, Any]:
        """
        Accept a pending order. Moves counter from pending to active.
        
        Returns dict with order info for notification purposes.
        """
        async with self.session.begin():
            order = await self.session.get(Order, order_id)
            if not order:
                raise OrderNotFoundError(order_id)
            
            if order.status != "pending":
                raise InvalidOrderStatusError(order_id, order.status, "pending")
            
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
                "total_price": float(order.total_price),
                "new_status": "accepted"
            }
    
    async def reject_order(self, order_id: int) -> Dict[str, Any]:
        """
        Reject a pending order. Frees up pending slot.
        
        Returns dict with order info for notification purposes.
        """
        async with self.session.begin():
            order = await self.session.get(Order, order_id)
            if not order:
                raise OrderNotFoundError(order_id)
            
            if order.status != "pending":
                raise InvalidOrderStatusError(order_id, order.status, "pending")
            
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
                "total_price": float(order.total_price),
                "new_status": "rejected"
            }
    
    async def complete_order(self, order_id: int) -> Dict[str, Any]:
        """
        Mark accepted order as done (by seller). Frees up active slot.
        
        Returns dict with order info for notification purposes.
        """
        async with self.session.begin():
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
            
            return {
                "order_id": order.id,
                "buyer_id": order.buyer_id,
                "seller_id": order.seller_id,
                "items_info": order.items_info,
                "total_price": float(order.total_price),
                "new_status": "done"
            }
    
    async def update_status(
        self,
        order_id: int,
        new_status: str,
        accrue_commissions_func=None
    ) -> Dict[str, Any]:
        """
        Update order status with proper counter management.
        
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
        
        async with self.session.begin():
            order = await self.session.get(Order, order_id)
            if not order:
                raise OrderNotFoundError(order_id)
            
            old_status = order.status
            order.status = new_status
            
            # Handle counter updates when order finishes
            if new_status == "done" and old_status in ["accepted", "assembling", "in_transit"]:
                seller = await self._get_seller_for_update(order.seller_id)
                if seller and seller.active_orders > 0:
                    seller.active_orders -= 1
            
            # Accrue commissions when buyer confirms receipt
            if new_status == "completed" and old_status != "completed" and accrue_commissions_func:
                commissions_accrued = await accrue_commissions_func(
                    session=self.session,
                    order_total=float(order.total_price),
                    buyer_id=order.buyer_id
                )
            
            result = {
                "order_id": order.id,
                "buyer_id": order.buyer_id,
                "seller_id": order.seller_id,
                "items_info": order.items_info,
                "total_price": float(order.total_price),
                "old_status": old_status,
                "new_status": new_status,
                "commissions_accrued": commissions_accrued
            }
        
        return result
    
    async def get_seller_orders(
        self,
        seller_id: int,
        status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get orders for a seller with optional status filter."""
        query = select(Order).where(Order.seller_id == seller_id)
        
        if status:
            query = query.where(Order.status == status)
        
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
                "status": o.status,
                "delivery_type": o.delivery_type,
                "address": o.address,
                "created_at": o.created_at.isoformat() if o.created_at else None
            }
            for o in orders
        ]
    
    async def get_buyer_orders(self, buyer_id: int) -> List[Dict[str, Any]]:
        """Get orders for a buyer."""
        query = (
            select(Order)
            .where(Order.buyer_id == buyer_id)
            .order_by(Order.created_at.desc())
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
    
    async def get_seller_stats(self, seller_id: int) -> Dict[str, Any]:
        """Get order statistics for a seller."""
        # Revenue from completed orders
        result = await self.session.execute(
            select(
                func.count(Order.id).label("total_orders"),
                func.coalesce(func.sum(Order.total_price), 0).label("total_revenue")
            ).where(
                Order.seller_id == seller_id,
                Order.status.in_(["done", "completed"])
            )
        )
        row = result.one()
        
        total_orders = row.total_orders or 0
        total_revenue = float(row.total_revenue or 0)
        commission = round(total_revenue * 0.18, 2)  # 18% platform commission
        
        # Orders by status
        status_result = await self.session.execute(
            select(
                Order.status,
                func.count(Order.id).label("count")
            ).where(Order.seller_id == seller_id).group_by(Order.status)
        )
        status_counts = {row.status: row.count for row in status_result}
        
        return {
            "total_completed_orders": total_orders,
            "total_revenue": total_revenue,
            "commission_18": commission,
            "net_revenue": round(total_revenue - commission, 2),
            "orders_by_status": status_counts
        }


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
