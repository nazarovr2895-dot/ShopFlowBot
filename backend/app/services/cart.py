# backend/app/services/cart.py
"""Cart and favorites services for Mini App."""
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_
from typing import List, Dict, Any, Optional
from decimal import Decimal

from backend.app.models.cart import CartItem, BuyerFavoriteSeller, BuyerFavoriteProduct
from backend.app.models.product import Product
from backend.app.models.seller import Seller
from backend.app.models.user import User
from backend.app.services.orders import OrderService, OrderServiceError
from backend.app.services.sellers import get_preorder_available_dates


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
            delivery_price = float(getattr(seller, "delivery_price", 0) or 0) if seller else 0
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
                    }
                    for it in items
                ],
                "total": round(total, 2),
                "delivery_price": round(delivery_price, 2),
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
                )
                if preorder_date.isoformat() not in available:
                    raise CartServiceError("Выбранная дата недоступна для предзаказа", 400)
        else:
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
            if not is_preorder and product.quantity < new_qty:
                new_qty = product.quantity
            item.quantity = new_qty
            if is_preorder:
                item.is_preorder = True
                item.preorder_delivery_date = preorder_date
        else:
            item = CartItem(
                buyer_id=buyer_id,
                seller_id=product.seller_id,
                product_id=product_id,
                quantity=quantity,
                name=product.name,
                price=product.price,
                is_preorder=is_preorder,
                preorder_delivery_date=preorder_date,
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
        comment: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Create one order per (seller, is_preorder) from cart, then clear cart.
        Regular and preorder items for the same seller become separate orders.
        Returns list of { order_id, seller_id, total_price }.
        """
        groups = await self.get_cart(buyer_id)
        if not groups:
            raise CartServiceError("Cart is empty", 400)
        
        # Ensure fio has a value (should be set by API, but add fallback for safety)
        if not fio or not fio.strip():
            fio = "Покупатель"
        
        order_service = OrderService(self.session)
        created = []
        for group in groups:
            seller_id = group["seller_id"]
            seller = await self.session.get(Seller, seller_id)
            addr = address
            if delivery_type == "Самовывоз" and seller and getattr(seller, "map_url", None):
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
                if seller and getattr(seller, "delivery_price", None) and delivery_type == "Доставка":
                    total += Decimal(str(seller.delivery_price or 0))
                items_info = ", ".join(f"{it['product_id']}:{it['name']} x {it['quantity']}" for it in items)
                preorder_date: Optional[date] = None
                if is_preorder and items:
                    d = items[0].get("preorder_delivery_date")
                    if d:
                        try:
                            preorder_date = date.fromisoformat(d[:10])
                        except (ValueError, TypeError):
                            pass
                try:
                    order = await order_service.create_order(
                        buyer_id=buyer_id,
                        seller_id=seller_id,
                        items_info=items_info,
                        total_price=total,
                        delivery_type=delivery_type,
                        address=addr,
                        comment=(comment or "").strip() or None,
                        is_preorder=is_preorder,
                        preorder_delivery_date=preorder_date,
                    )
                    created.append({"order_id": order.id, "seller_id": seller_id, "total_price": float(order.total_price)})
                except OrderServiceError as e:
                    raise CartServiceError(e.message, e.status_code)
        await self.clear_cart(buyer_id)
        return created


class FavoriteSellersService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(self, buyer_id: int, seller_id: int) -> None:
        """Add seller to favorites (idempotent). Validates seller exists and is not blocked/deleted."""
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
            return  # already in favorites
        self.session.add(BuyerFavoriteSeller(buyer_id=buyer_id, seller_id=seller_id))
        await self.session.flush()

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

    async def get_favorite_sellers(self, buyer_id: int) -> List[Dict[str, Any]]:
        """Get favorite sellers with shop_name, owner_fio (same shape as visited for frontend)."""
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
