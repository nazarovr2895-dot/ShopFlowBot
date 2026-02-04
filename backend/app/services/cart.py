# backend/app/services/cart.py
"""Cart and visited sellers services for Mini App."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_
from typing import List, Dict, Any, Optional
from decimal import Decimal

from backend.app.models.cart import CartItem, BuyerVisitedSeller
from backend.app.models.product import Product
from backend.app.models.seller import Seller
from backend.app.models.user import User
from backend.app.services.orders import OrderService, OrderServiceError


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

        out = []
        for seller_id, items in by_seller.items():
            seller = sellers.get(seller_id)
            shop_name = (seller.shop_name or "Магазин") if seller else "Магазин"
            total = sum(float(it.price) * it.quantity for it in items)
            out.append({
                "seller_id": seller_id,
                "shop_name": shop_name,
                "items": [
                    {
                        "product_id": it.product_id,
                        "name": it.name,
                        "price": float(it.price),
                        "quantity": it.quantity,
                    }
                    for it in items
                ],
                "total": round(total, 2),
            })
        return out

    async def add_item(self, buyer_id: int, product_id: int, quantity: int = 1) -> Dict[str, Any]:
        """Add or update cart item. Validates product exists and quantity available."""
        if quantity < 1:
            raise CartServiceError("Quantity must be >= 1", 400)
        product = await self.session.get(Product, product_id)
        if not product or not product.is_active:
            raise CartServiceError("Product not found", 404)
        if product.quantity < 1:
            raise CartServiceError("Product out of stock", 400)
        if quantity > product.quantity:
            quantity = product.quantity
        existing = await self.session.execute(
            select(CartItem).where(
                and_(
                    CartItem.buyer_id == buyer_id,
                    CartItem.seller_id == product.seller_id,
                    CartItem.product_id == product_id,
                )
            )
        )
        item = existing.scalar_one_or_none()
        if item:
            new_qty = item.quantity + quantity
            if new_qty > product.quantity:
                new_qty = product.quantity
            item.quantity = new_qty
        else:
            item = CartItem(
                buyer_id=buyer_id,
                seller_id=product.seller_id,
                product_id=product_id,
                quantity=quantity,
                name=product.name,
                price=product.price,
            )
            self.session.add(item)
        await self.session.flush()
        return {"product_id": product_id, "quantity": item.quantity, "seller_id": product.seller_id}

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
        if quantity <= 0:
            await self.session.delete(item)
            return
        product = await self.session.get(Product, product_id)
        if product and product.quantity < quantity:
            quantity = product.quantity
        item.quantity = quantity
        await self.session.flush()

    async def remove_item(self, buyer_id: int, product_id: int) -> None:
        await self.session.execute(
            delete(CartItem).where(
                and_(CartItem.buyer_id == buyer_id, CartItem.product_id == product_id)
            )
        )

    async def clear_cart(self, buyer_id: int) -> None:
        await self.session.execute(delete(CartItem).where(CartItem.buyer_id == buyer_id))

    async def checkout(
        self,
        buyer_id: int,
        fio: str,
        phone: str,
        delivery_type: str,
        address: str,
    ) -> List[Dict[str, Any]]:
        """
        Create one order per seller from cart, then clear cart.
        Returns list of { order_id, seller_id, total_price }.
        """
        groups = await self.get_cart(buyer_id)
        if not groups:
            raise CartServiceError("Cart is empty", 400)
        order_service = OrderService(self.session)
        created = []
        for group in groups:
            seller_id = group["seller_id"]
            items = group["items"]
            total = Decimal(str(group["total"]))
            seller = await self.session.get(Seller, seller_id)
            if seller and getattr(seller, "delivery_price", None) and delivery_type == "Доставка":
                total += Decimal(str(seller.delivery_price or 0))
            items_info = ", ".join(f"{it['product_id']}:{it['name']} x {it['quantity']}" for it in items)
            addr = address
            if delivery_type == "Самовывоз" and seller and getattr(seller, "map_url", None):
                addr = (seller.map_url or "") + f"\n📞 {phone}\n👤 {fio}"
            else:
                addr = f"{address}\n📞 {phone}\n👤 {fio}"
            try:
                order = await order_service.create_order(
                    buyer_id=buyer_id,
                    seller_id=seller_id,
                    items_info=items_info,
                    total_price=total,
                    delivery_type=delivery_type,
                    address=addr,
                    agent_id=None,
                )
                created.append({"order_id": order.id, "seller_id": seller_id, "total_price": float(order.total_price)})
            except OrderServiceError as e:
                raise CartServiceError(e.message, e.status_code)
        await self.clear_cart(buyer_id)
        return created


class VisitedSellersService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def record_visit(self, buyer_id: int, seller_id: int) -> None:
        """Record or update visit timestamp (upsert by buyer_id, seller_id)."""
        result = await self.session.execute(
            select(BuyerVisitedSeller).where(
                and_(
                    BuyerVisitedSeller.buyer_id == buyer_id,
                    BuyerVisitedSeller.seller_id == seller_id,
                )
            )
        )
        row = result.scalar_one_or_none()
        if row:
            from datetime import datetime
            row.visited_at = datetime.utcnow()
        else:
            self.session.add(BuyerVisitedSeller(buyer_id=buyer_id, seller_id=seller_id))
        await self.session.flush()

    async def get_visited_sellers(self, buyer_id: int, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recently visited sellers with shop_name, etc."""
        from sqlalchemy import desc
        from backend.app.models.seller import Seller
        from backend.app.models.user import User

        result = await self.session.execute(
            select(BuyerVisitedSeller)
            .where(BuyerVisitedSeller.buyer_id == buyer_id)
            .order_by(desc(BuyerVisitedSeller.visited_at))
            .limit(limit)
        )
        visits = result.scalars().all()
        if not visits:
            return []
        seller_ids = [v.seller_id for v in visits]
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
                "visited_at": None,
            }
        for v in visits:
            if v.seller_id in sellers_map:
                sellers_map[v.seller_id]["visited_at"] = v.visited_at.isoformat() if v.visited_at else None
        return [sellers_map[v.seller_id] for v in visits if v.seller_id in sellers_map]
