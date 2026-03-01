from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from pydantic import BaseModel

from backend.app.api.deps import get_session
from backend.app.core.logging import get_logger
from backend.app.schemas import BuyerCreate, BuyerResponse
from backend.app.core.auth import (
    TelegramInitData,
    get_current_user_optional,
    get_current_user,
    get_current_user_hybrid,
    verify_user_id,
)
from backend.app.services.buyers import (
    BuyerService,
    BuyerServiceError,
    UserNotFoundError,
)
from backend.app.services.cart import CartService, FavoriteSellersService, FavoriteProductsService, CartServiceError
from backend.app.services.orders import OrderService, OrderNotFoundError, InvalidOrderStatusError
from backend.app.services.loyalty import LoyaltyService
from backend.app.models.order import Order
from backend.app.models.loyalty import normalize_phone

router = APIRouter()
logger = get_logger(__name__)


def _handle_service_error(e: BuyerServiceError):
    """Convert service exceptions to HTTP exceptions."""
    raise HTTPException(status_code=e.status_code, detail=e.message)


def _handle_cart_error(e: CartServiceError):
    raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/me", response_model=BuyerResponse)
async def get_current_buyer(
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Получить информацию о текущем пользователе (для Mini App)"""
    service = BuyerService(session)
    user = await service.get_buyer(current_user.user.id)
    
    if not user:
        # Если пользователь не найден, создаем его
        user = await service.register_buyer(
            tg_id=current_user.user.id,
            username=current_user.user.username,
            fio=current_user.user.first_name
        )
    
    # Get user info as dict (includes city_id and district_id)
    user_info = await service.get_buyer_info(current_user.user.id)
    return user_info


@router.get("/{telegram_id}", response_model=Optional[BuyerResponse])
async def get_buyer(telegram_id: int, session: AsyncSession = Depends(get_session)):
    """Найти пользователя по Telegram ID"""
    service = BuyerService(session)
    user = await service.get_buyer(telegram_id)
    
    if not user:
        return None
    
    # Add id field for schema compatibility
    user.id = user.tg_id
    return user


@router.post("/register", response_model=BuyerResponse)
async def register_buyer(
    data: BuyerCreate,
    session: AsyncSession = Depends(get_session),
    current_user: Optional[TelegramInitData] = Depends(get_current_user_optional),
):
    """
    Создать или обновить пользователя.
    
    Если запрос приходит от аутентифицированного пользователя (Mini App),
    проверяем что tg_id совпадает с ID пользователя Telegram.
    """
    logger.info(
        "Registering buyer",
        tg_id=data.tg_id,
        username=data.username,
        has_referrer=data.referrer_id is not None,
    )
    
    # Validate that authenticated user can only register themselves
    if current_user:
        verify_user_id(current_user, data.tg_id)
    
    service = BuyerService(session)
    user = await service.register_buyer(
        tg_id=data.tg_id,
        username=data.username,
        fio=data.fio,
        referrer_id=data.referrer_id
    )
    
    logger.info("Buyer registered", tg_id=data.tg_id, role=user.role)
    
    # Add id field for schema compatibility
    user.id = user.tg_id
    return user


class LocationUpdate(BaseModel):
    """Схема для обновления локации пользователя"""
    city_id: Optional[int] = None
    district_id: Optional[int] = None


class ProfileUpdate(BaseModel):
    """Схема для обновления профиля покупателя (ФИО, телефон)."""
    fio: Optional[str] = None
    phone: Optional[str] = None


@router.post("/me/accept-privacy", response_model=BuyerResponse)
async def accept_privacy(
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Принять согласие на обработку персональных данных (152-ФЗ)."""
    from datetime import datetime

    tg_id = current_user.user.id
    service = BuyerService(session)

    try:
        updated_user = await service.update_profile(
            tg_id=tg_id,
            privacy_accepted=True,
            privacy_accepted_at=datetime.now(),
        )
        updated_user["id"] = updated_user["tg_id"]
        return updated_user
    except BuyerServiceError as e:
        logger.warning("Privacy accept failed", tg_id=tg_id, error=e.message)
        _handle_service_error(e)


@router.put("/me/location", response_model=BuyerResponse)
async def update_location(
    data: LocationUpdate,
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """
    Обновить локацию текущего пользователя (город и район).
    
    Используется в Mini App для сохранения выбранных фильтров.
    """
    logger.info(
        "Updating user location",
        tg_id=current_user.user.id,
        city_id=data.city_id,
        district_id=data.district_id,
    )
    
    service = BuyerService(session)
    
    try:
        updated_user = await service.update_profile(
            tg_id=current_user.user.id,
            city_id=data.city_id,
            district_id=data.district_id,
        )
        logger.info("User location updated", tg_id=current_user.user.id)
        
        # Add id field for schema compatibility
        updated_user["id"] = updated_user["tg_id"]
        return updated_user
    except BuyerServiceError as e:
        logger.warning("Location update failed", tg_id=current_user.user.id, error=e.message)
        _handle_service_error(e)


@router.put("/me", response_model=BuyerResponse)
async def update_profile(
    data: ProfileUpdate,
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """
    Обновить профиль текущего пользователя (ФИО, телефон).
    Телефон нормализуется и должен быть в формате +7 и 11 цифр для совпадения с программой лояльности.
    """
    tg_id = current_user.user.id
    service = BuyerService(session)

    update_kwargs: dict = {}
    if data.fio is not None:
        update_kwargs["fio"] = data.fio.strip() if isinstance(data.fio, str) else data.fio

    if data.phone is not None:
        normalized = normalize_phone(data.phone)
        if not normalized or len(normalized) != 11 or normalized[0] != "7":
            raise HTTPException(
                status_code=400,
                detail="Неверный формат телефона. Ожидается +7 000 000 00 00",
            )
        update_kwargs["phone"] = normalized

    if not update_kwargs:
        user_info = await service.get_buyer_info(tg_id)
        if user_info:
            user_info["id"] = user_info["tg_id"]
        return user_info

    try:
        updated_user = await service.update_profile(tg_id=tg_id, **update_kwargs)
        updated_user["id"] = updated_user["tg_id"]
        # Auto-link loyalty for existing subscriptions when phone is updated
        if "phone" in update_kwargs:
            try:
                from backend.app.services.cart import FavoriteSellersService
                fav_svc = FavoriteSellersService(session)
                await fav_svc.auto_link_loyalty_for_subscriptions(tg_id)
                await session.commit()
            except Exception:
                pass  # Don't fail profile update if loyalty linking fails
        return updated_user
    except BuyerServiceError as e:
        logger.warning("Profile update failed", tg_id=tg_id, error=e.message)
        _handle_service_error(e)


# --- Cart (Mini App) ---
class CartItemAdd(BaseModel):
    product_id: int
    quantity: int = 1
    preorder_delivery_date: Optional[str] = None  # YYYY-MM-DD for preorder products


class CartItemUpdate(BaseModel):
    quantity: int


class PointsUsagePerSeller(BaseModel):
    seller_id: int
    points_to_use: float


class DeliveryPerSeller(BaseModel):
    seller_id: int
    delivery_type: str  # "Доставка" | "Самовывоз"


class DeliverySlotPerSeller(BaseModel):
    seller_id: int
    date: str       # YYYY-MM-DD
    start: str      # HH:MM
    end: str        # HH:MM


class GiftNotePerSeller(BaseModel):
    seller_id: int
    gift_note: str


class CheckoutBody(BaseModel):
    fio: Optional[str] = None
    phone: str
    delivery_type: str = "Самовывоз"  # fallback/default
    address: str = ""
    comment: Optional[str] = None
    points_usage: Optional[List[PointsUsagePerSeller]] = None
    delivery_by_seller: Optional[List[DeliveryPerSeller]] = None
    delivery_slots: Optional[List[DeliverySlotPerSeller]] = None
    buyer_district_id: Optional[int] = None  # district for delivery zone matching
    buyer_district_name: Optional[str] = None  # district name from DaData (e.g. "Арбат")
    # Recipient fields ("Получатель не я")
    recipient_name: Optional[str] = None
    recipient_phone: Optional[str] = None
    # Gift notes per seller ("Записка к цветам")
    gift_notes_by_seller: Optional[List[GiftNotePerSeller]] = None


class VisitedSellerRecord(BaseModel):
    seller_id: int


class FavoriteProductRecord(BaseModel):
    product_id: int


@router.get("/me/cart")
async def get_cart(
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Корзина текущего пользователя (сгруппировано по продавцам)."""
    service = CartService(session)
    return await service.get_cart(current_user.user.id)


@router.post("/me/cart/items")
async def add_cart_item(
    data: CartItemAdd,
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Добавить товар в корзину."""
    service = CartService(session)
    try:
        result = await service.add_item(
            current_user.user.id,
            data.product_id,
            data.quantity,
            preorder_delivery_date=data.preorder_delivery_date,
        )
        await session.commit()
        return result
    except CartServiceError as e:
        await session.rollback()
        _handle_cart_error(e)


@router.put("/me/cart/items/{product_id}")
async def update_cart_item(
    product_id: int,
    data: CartItemUpdate,
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Изменить количество (0 = удалить)."""
    service = CartService(session)
    await service.update_item(current_user.user.id, product_id, data.quantity)
    await session.commit()
    return {"status": "ok"}


@router.delete("/me/cart/items/{product_id}")
async def remove_cart_item(
    product_id: int,
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Удалить товар из корзины."""
    service = CartService(session)
    await service.remove_item(current_user.user.id, product_id)
    await session.commit()
    return {"status": "ok"}


@router.post("/me/cart/items/{product_id}/extend-reservation")
async def extend_reservation(
    product_id: int,
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Продлить резервирование товара в корзине (сбросить таймер 5 минут)."""
    from backend.app.services.reservations import ReservationService, RESERVATION_TTL_SECONDS
    svc = ReservationService(session)
    new_reserved_at = await svc.extend_reservation(current_user.user.id, product_id)
    if not new_reserved_at:
        raise HTTPException(status_code=409, detail="Резервирование истекло или товар не найден")
    await session.commit()
    return {"reserved_at": new_reserved_at.isoformat(), "ttl_seconds": RESERVATION_TTL_SECONDS}


@router.delete("/me/cart")
async def clear_cart(
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Очистить корзину."""
    service = CartService(session)
    await service.clear_cart(current_user.user.id)
    await session.commit()
    return {"status": "ok"}


@router.post("/me/cart/checkout")
async def checkout_cart(
    data: CheckoutBody,
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Оформить заказы из корзины (один заказ на каждого продавца), очистить корзину."""
    service = CartService(session)
    try:
        # Use Telegram first_name if fio is not provided
        fio = data.fio
        if not fio:
            fio = current_user.user.first_name
            if current_user.user.last_name:
                fio = f"{fio} {current_user.user.last_name}"
            fio = fio.strip() if fio else "Покупатель"
        
        # Build points_usage dict: seller_id -> points_to_use
        points_by_seller = {}
        if data.points_usage:
            for pu in data.points_usage:
                if pu.points_to_use > 0:
                    points_by_seller[pu.seller_id] = pu.points_to_use

        # Build per-seller delivery type map
        delivery_map: dict = {}
        if data.delivery_by_seller:
            for item in data.delivery_by_seller:
                delivery_map[item.seller_id] = item.delivery_type

        # Build per-seller delivery slots map
        slots_map: dict = {}
        if data.delivery_slots:
            for slot in data.delivery_slots:
                slots_map[slot.seller_id] = {"date": slot.date, "start": slot.start, "end": slot.end}

        # Build gift notes map: {seller_id: note_text}
        gift_notes_map: dict = {}
        if data.gift_notes_by_seller:
            for gn in data.gift_notes_by_seller:
                if gn.gift_note.strip():
                    gift_notes_map[gn.seller_id] = gn.gift_note.strip()

        orders = await service.checkout(
            current_user.user.id,
            fio=fio,
            phone=data.phone,
            delivery_type=data.delivery_type,
            address=data.address,
            comment=data.comment,
            points_by_seller=points_by_seller or None,
            delivery_by_seller=delivery_map or None,
            buyer_district_id=data.buyer_district_id,
            buyer_district_name=data.buyer_district_name,
            delivery_slots_by_seller=slots_map or None,
            recipient_name=data.recipient_name,
            recipient_phone=data.recipient_phone,
            gift_notes_by_seller=gift_notes_map or None,
        )
        await session.commit()

        # Send Telegram notification to seller for each created order
        from backend.app.services.telegram_notify import notify_seller_new_order, resolve_notification_chat_id
        for o in orders:
            preorder_date_str = o.get("preorder_delivery_date")
            if preorder_date_str:
                # Format YYYY-MM-DD to DD.MM.YYYY for display
                try:
                    from datetime import date as _date
                    d = _date.fromisoformat(preorder_date_str)
                    preorder_date_str = d.strftime("%d.%m.%Y")
                except (ValueError, TypeError):
                    pass
            _chat_id = await resolve_notification_chat_id(session, o["seller_id"])
            await notify_seller_new_order(
                seller_id=_chat_id,
                order_id=o["order_id"],
                items_info=o.get("items_info", ""),
                total_price=o.get("total_price"),
                is_preorder=o.get("is_preorder", False),
                preorder_delivery_date=preorder_date_str,
                delivery_type=o.get("delivery_type"),
                delivery_fee=o.get("delivery_fee"),
                delivery_zone_name=o.get("delivery_zone_name"),
                recipient_name=data.recipient_name,
                recipient_phone=data.recipient_phone,
                gift_note=gift_notes_map.get(o["seller_id"]),
            )

        return {"orders": orders}
    except CartServiceError as e:
        await session.rollback()
        _handle_cart_error(e)


# --- Favorite sellers / Подписки (Mini App) ---
@router.get("/me/favorite-sellers")
async def get_favorite_sellers(
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Список избранных магазинов с полными данными (как в каталоге)."""
    from sqlalchemy import select, func, and_, case
    from backend.app.models.seller import Seller, City, District, Metro
    from backend.app.models.product import Product
    from backend.app.models.user import User
    from backend.app.models.cart import BuyerFavoriteSeller
    from backend.app.services.sellers import _today_6am_date
    from backend.app.api.public import _normalize_delivery_type

    # Get favorite seller IDs
    fav_result = await session.execute(
        select(BuyerFavoriteSeller.seller_id).where(
            BuyerFavoriteSeller.buyer_id == current_user.user.id
        )
    )
    fav_ids = [row[0] for row in fav_result.all()]
    if not fav_ids:
        return []

    today = _today_6am_date()

    effective_limit_expr = case(
        (and_(Seller.daily_limit_date == today, Seller.max_orders > 0), Seller.max_orders),
        else_=func.coalesce(Seller.default_daily_limit, 30),
    )

    product_stats = (
        select(
            Product.seller_id,
            func.min(Product.price).label("min_price"),
            func.max(Product.price).label("max_price"),
            func.count(Product.id).label("product_count"),
        )
        .where(Product.is_active == True, Product.quantity > 0)
        .group_by(Product.seller_id)
        .subquery()
    )

    subscriber_count_subq = (
        select(
            BuyerFavoriteSeller.seller_id,
            func.count(BuyerFavoriteSeller.id).label("subscriber_count"),
        )
        .group_by(BuyerFavoriteSeller.seller_id)
        .subquery()
    )

    available_slots_expr = effective_limit_expr - Seller.active_orders - Seller.pending_requests

    query = (
        select(
            Seller,
            User.fio.label("owner_fio"),
            City.name.label("city_name"),
            District.name.label("district_name"),
            Metro.name.label("metro_name"),
            Metro.line_color.label("metro_line_color"),
            product_stats.c.min_price,
            product_stats.c.max_price,
            func.coalesce(product_stats.c.product_count, 0).label("product_count"),
            func.coalesce(subscriber_count_subq.c.subscriber_count, 0).label("subscriber_count"),
            available_slots_expr.label("available_slots"),
        )
        .outerjoin(User, Seller.owner_id == User.tg_id)
        .outerjoin(City, Seller.city_id == City.id)
        .outerjoin(District, Seller.district_id == District.id)
        .outerjoin(Metro, Seller.metro_id == Metro.id)
        .outerjoin(product_stats, Seller.seller_id == product_stats.c.seller_id)
        .outerjoin(subscriber_count_subq, Seller.seller_id == subscriber_count_subq.c.seller_id)
        .where(Seller.seller_id.in_(fav_ids), Seller.deleted_at.is_(None))
    )

    result = await session.execute(query)
    rows = result.all()

    sellers = []
    for row in rows:
        seller = row[0]
        slots = row.available_slots if hasattr(row, "available_slots") and row.available_slots else 0
        availability = "available" if slots > 0 else "busy"

        sellers.append({
            "seller_id": seller.seller_id,
            "shop_name": seller.shop_name or "Магазин",
            "owner_fio": row.owner_fio,
            "delivery_type": _normalize_delivery_type(seller.delivery_type),
            "delivery_price": 0.0,  # deprecated: use delivery zones
            "city_name": row.city_name,
            "district_name": row.district_name,
            "metro_name": row.metro_name,
            "metro_walk_minutes": seller.metro_walk_minutes,
            "metro_line_color": row.metro_line_color,
            "available_slots": max(slots, 0),
            "availability": availability,
            "min_price": float(row.min_price) if row.min_price else None,
            "max_price": float(row.max_price) if row.max_price else None,
            "product_count": row.product_count or 0,
            "subscriber_count": row.subscriber_count or 0,
        })
    return sellers


@router.post("/me/favorite-sellers")
async def add_favorite_seller(
    data: VisitedSellerRecord,
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Добавить магазин в «Мои цветочные»."""
    fav = FavoriteSellersService(session)
    try:
        await fav.add(current_user.user.id, data.seller_id)
        await session.commit()
        return {"status": "ok"}
    except CartServiceError as e:
        await session.rollback()
        _handle_cart_error(e)


@router.delete("/me/favorite-sellers/{seller_id}")
async def remove_favorite_seller(
    seller_id: int,
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Убрать магазин из «Мои цветочные»."""
    fav = FavoriteSellersService(session)
    await fav.remove(current_user.user.id, seller_id)
    await session.commit()
    return {"status": "ok"}


# --- Favorite products / Избранные товары (Mini App) ---
@router.get("/me/favorite-products")
async def get_favorite_products(
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Список избранных товаров."""
    fav = FavoriteProductsService(session)
    return await fav.get_favorite_products(current_user.user.id)


@router.post("/me/favorite-products")
async def add_favorite_product(
    data: FavoriteProductRecord,
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Добавить товар в избранное."""
    fav = FavoriteProductsService(session)
    try:
        await fav.add(current_user.user.id, data.product_id)
        await session.commit()
        return {"status": "ok"}
    except CartServiceError as e:
        await session.rollback()
        _handle_cart_error(e)


@router.delete("/me/favorite-products/{product_id}")
async def remove_favorite_product(
    product_id: int,
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Убрать товар из избранного."""
    fav = FavoriteProductsService(session)
    await fav.remove(current_user.user.id, product_id)
    await session.commit()
    return {"status": "ok"}


# --- Loyalty (Mini App: мой баланс у продавца) ---
@router.get("/me/loyalty/{seller_id}")
async def get_my_loyalty_at_seller(
    seller_id: int,
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Баланс баллов клубной карты у данного продавца (по телефону покупателя)."""
    from backend.app.models.user import User
    user = await session.get(User, current_user.user.id)
    buyer_phone = user.phone if user else None
    if not buyer_phone:
        return {"points_balance": 0, "points_percent": 0, "card_number": None, "linked": False, "max_points_discount_percent": 100, "points_to_ruble_rate": 1}
    loyalty_svc = LoyaltyService(session)
    customer = await loyalty_svc.find_customer_by_phone(seller_id, buyer_phone)
    if not customer:
        return {"points_balance": 0, "points_percent": 0, "card_number": None, "linked": False, "max_points_discount_percent": 100, "points_to_ruble_rate": 1}
    points_percent = await loyalty_svc.get_points_percent(seller_id)
    from backend.app.models.seller import Seller
    seller = await session.get(Seller, seller_id)
    max_pct = int(getattr(seller, "max_points_discount_percent", 100) or 100) if seller else 100
    rate = float(getattr(seller, "points_to_ruble_rate", 1) or 1) if seller else 1.0
    return {
        "points_balance": float(customer.points_balance or 0),
        "points_percent": points_percent,
        "card_number": customer.card_number,
        "linked": True,
        "max_points_discount_percent": max_pct,
        "points_to_ruble_rate": rate,
    }


# --- Orders (Mini App: мои заказы) ---
@router.get("/me/orders")
async def get_my_orders(
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Заказы текущего пользователя (для Mini App)."""
    order_service = OrderService(session)
    return await order_service.get_buyer_orders(current_user.user.id)


@router.post("/me/orders/{order_id}/confirm")
async def confirm_order_received(
    order_id: int,
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Подтвердить получение заказа (статус -> completed). Доступно только покупателю этого заказа."""
    order = await session.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.buyer_id != current_user.user.id:
        raise HTTPException(status_code=403, detail="Not your order")
    if order.status not in ("done", "in_transit", "ready_for_pickup", "assembling", "accepted"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot confirm: order status is {order.status}",
        )
    order_service = OrderService(session)
    try:
        result = await order_service.update_status(
            order_id,
            "completed",
        )
        await session.commit()
        return {"status": "ok", "new_status": result["new_status"]}
    except (OrderNotFoundError, InvalidOrderStatusError) as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/me/orders/{order_id}/cancel")
async def cancel_order(
    order_id: int,
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
    session: AsyncSession = Depends(get_session),
):
    """Отменить заказ (pending/accepted/assembling). Восстанавливает инвентарь и баллы."""
    from backend.app.services.orders import OrderServiceError
    order_service = OrderService(session)
    try:
        result = await order_service.cancel_order(order_id, current_user.user.id)
        await session.commit()

        # Auto-refund if order was paid
        order_obj = await session.get(Order, order_id)
        if order_obj and order_obj.payment_status == "succeeded":
            try:
                from backend.app.services.payment import PaymentService
                pay_svc = PaymentService(session)
                await pay_svc.refund_payment(order_id)
                await session.commit()
                from backend.app.services.telegram_notify import (
                    notify_buyer_payment_refunded, notify_seller_payment_refunded, resolve_notification_chat_id,
                )
                refund_amt = result.get("total_price", 0)
                if order_obj.buyer_id:
                    await notify_buyer_payment_refunded(
                        order_obj.buyer_id, order_id, order_obj.seller_id, refund_amt,
                    )
                _chat_id = await resolve_notification_chat_id(session, order_obj.seller_id)
                await notify_seller_payment_refunded(
                    _chat_id, order_id, refund_amt,
                )
            except Exception as refund_err:
                logger.warning(
                    "Auto-refund failed for cancelled order",
                    order_id=order_id,
                    error=str(refund_err),
                )

        # Notify seller about cancellation
        from backend.app.services.telegram_notify import resolve_notification_chat_id as _resolve_chat
        _chat_id = await _resolve_chat(session, result["seller_id"])
        is_preorder = result.get("is_preorder", False)
        if is_preorder:
            from backend.app.services.telegram_notify import notify_seller_preorder_cancelled
            preorder_date = None
            order_obj = await session.get(Order, order_id)
            if order_obj and getattr(order_obj, "preorder_delivery_date", None):
                preorder_date = order_obj.preorder_delivery_date.strftime("%d.%m.%Y")
            await notify_seller_preorder_cancelled(
                seller_id=_chat_id,
                order_id=order_id,
                items_info=result.get("items_info", ""),
                preorder_delivery_date=preorder_date,
            )
        else:
            from backend.app.services.telegram_notify import notify_seller_order_cancelled
            await notify_seller_order_cancelled(
                seller_id=_chat_id,
                order_id=order_id,
                items_info=result.get("items_info", ""),
            )

        return {
            "status": "ok",
            "new_status": result["new_status"],
            "points_refunded": result.get("points_refunded", 0),
        }
    except (OrderNotFoundError, InvalidOrderStatusError) as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except OrderServiceError as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
