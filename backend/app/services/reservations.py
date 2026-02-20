"""Stock reservation service for 5-minute cart hold."""
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from backend.app.models.cart import CartItem
from backend.app.models.product import Product

RESERVATION_TTL_SECONDS = 300  # 5 minutes


class ReservationService:
    def __init__(self, session: AsyncSession):
        self.session = session

    @staticmethod
    def is_expired(reserved_at: Optional[datetime]) -> bool:
        if reserved_at is None:
            return True
        return (datetime.utcnow() - reserved_at).total_seconds() > RESERVATION_TTL_SECONDS

    async def reserve_stock(self, product_id: int, quantity: int) -> datetime:
        """
        Atomically reserve `quantity` units of product.
        Uses SELECT ... FOR UPDATE on the product row.
        Returns the reserved_at timestamp.
        Raises ValueError if insufficient available stock.
        """
        result = await self.session.execute(
            select(Product).where(Product.id == product_id).with_for_update()
        )
        product = result.scalar_one_or_none()
        if not product:
            raise ValueError("Product not found")

        available = product.quantity - product.reserved_quantity
        if available < quantity:
            raise ValueError(f"Недостаточно товара. Доступно: {available}")

        product.reserved_quantity += quantity
        return datetime.utcnow()

    async def release_stock(self, product_id: int, quantity: int) -> None:
        """Release `quantity` units back from reservation on product."""
        result = await self.session.execute(
            select(Product).where(Product.id == product_id).with_for_update()
        )
        product = result.scalar_one_or_none()
        if product:
            product.reserved_quantity = max(0, product.reserved_quantity - quantity)

    async def release_reservation(self, cart_item: CartItem) -> None:
        """Release reservation for a specific cart item."""
        if cart_item.reserved_at is not None and not cart_item.is_preorder:
            await self.release_stock(cart_item.product_id, cart_item.quantity)
            cart_item.reserved_at = None

    async def release_expired_for_buyer(self, buyer_id: int) -> int:
        """
        Find buyer's expired cart items, release reservations, delete from cart.
        Returns count of released items.
        """
        cutoff = datetime.utcnow() - timedelta(seconds=RESERVATION_TTL_SECONDS)
        result = await self.session.execute(
            select(CartItem).where(
                and_(
                    CartItem.buyer_id == buyer_id,
                    CartItem.reserved_at.isnot(None),
                    CartItem.reserved_at < cutoff,
                )
            )
        )
        expired_items = result.scalars().all()
        count = 0
        for item in expired_items:
            if not item.is_preorder:
                await self.release_stock(item.product_id, item.quantity)
            await self.session.delete(item)
            count += 1
        if count > 0:
            await self.session.flush()
        return count

    async def release_all_expired(self) -> int:
        """
        Global sweep: find all expired cart reservations and release them.
        For use by background sweeper task.
        Returns count of released items.
        """
        cutoff = datetime.utcnow() - timedelta(seconds=RESERVATION_TTL_SECONDS)
        result = await self.session.execute(
            select(CartItem).where(
                and_(
                    CartItem.reserved_at.isnot(None),
                    CartItem.reserved_at < cutoff,
                )
            )
        )
        expired_items = result.scalars().all()
        count = 0
        for item in expired_items:
            if not item.is_preorder:
                await self.release_stock(item.product_id, item.quantity)
            await self.session.delete(item)
            count += 1
        return count

    async def extend_reservation(self, buyer_id: int, product_id: int) -> Optional[datetime]:
        """
        Reset reserved_at to now for a cart item (extend 5-minute timer).
        Returns new reserved_at or None if item not found / already expired.
        """
        result = await self.session.execute(
            select(CartItem).where(
                and_(
                    CartItem.buyer_id == buyer_id,
                    CartItem.product_id == product_id,
                    CartItem.reserved_at.isnot(None),
                )
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            return None

        # If already expired, we need to re-reserve the stock
        if self.is_expired(item.reserved_at):
            # Check if stock is still available
            prod_result = await self.session.execute(
                select(Product).where(Product.id == product_id).with_for_update()
            )
            product = prod_result.scalar_one_or_none()
            if not product:
                return None
            available = product.quantity - product.reserved_quantity
            if available < item.quantity:
                return None
            product.reserved_quantity += item.quantity

        now = datetime.utcnow()
        item.reserved_at = now
        await self.session.flush()
        return now
