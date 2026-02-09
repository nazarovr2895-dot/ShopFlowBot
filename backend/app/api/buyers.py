from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from pydantic import BaseModel

from backend.app.api.deps import get_session
from backend.app.core.logging import get_logger
from backend.app.schemas import BuyerCreate, BuyerResponse
from backend.app.core.auth import (
    TelegramInitData,
    get_current_user_optional,
    get_current_user,
    verify_user_id,
)
from backend.app.services.buyers import (
    BuyerService,
    BuyerServiceError,
    UserNotFoundError,
)
from backend.app.services.cart import CartService, VisitedSellersService, FavoriteSellersService, CartServiceError
from backend.app.services.orders import OrderService, OrderNotFoundError, InvalidOrderStatusError
from backend.app.services.referrals import accrue_commissions
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
    current_user: TelegramInitData = Depends(get_current_user),
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


class AgentUpgrade(BaseModel):
    tg_id: int
    fio: str
    phone: str
    age: int
    is_self_employed: bool


@router.post("/upgrade_to_agent")
async def upgrade_to_agent(
    data: AgentUpgrade,
    session: AsyncSession = Depends(get_session),
    current_user: Optional[TelegramInitData] = Depends(get_current_user_optional),
):
    """
    Превращает покупателя в Агента.
    
    Если запрос приходит от аутентифицированного пользователя (Mini App),
    проверяем что tg_id совпадает с ID пользователя Telegram.
    """
    logger.info("Upgrading buyer to agent", tg_id=data.tg_id)
    
    # Validate that authenticated user can only upgrade themselves
    if current_user:
        verify_user_id(current_user, data.tg_id)
    
    service = BuyerService(session)
    
    try:
        result = await service.upgrade_to_agent(
            tg_id=data.tg_id,
            fio=data.fio,
            phone=data.phone,
            age=data.age,
            is_self_employed=data.is_self_employed
        )
        logger.info("Buyer upgraded to agent", tg_id=data.tg_id)
        return result
    except BuyerServiceError as e:
        logger.warning("Agent upgrade failed", tg_id=data.tg_id, error=e.message)
        _handle_service_error(e)


@router.put("/me/location", response_model=BuyerResponse)
async def update_location(
    data: LocationUpdate,
    current_user: TelegramInitData = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Обновить локацию текущего пользователя (город и округ).
    
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
    current_user: TelegramInitData = Depends(get_current_user),
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


class CheckoutBody(BaseModel):
    fio: str
    phone: str
    delivery_type: str  # "Доставка" | "Самовывоз"
    address: str


class VisitedSellerRecord(BaseModel):
    seller_id: int


@router.get("/me/cart")
async def get_cart(
    current_user: TelegramInitData = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Корзина текущего пользователя (сгруппировано по продавцам)."""
    service = CartService(session)
    return await service.get_cart(current_user.user.id)


@router.post("/me/cart/items")
async def add_cart_item(
    data: CartItemAdd,
    current_user: TelegramInitData = Depends(get_current_user),
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
    current_user: TelegramInitData = Depends(get_current_user),
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
    current_user: TelegramInitData = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Удалить товар из корзины."""
    service = CartService(session)
    await service.remove_item(current_user.user.id, product_id)
    await session.commit()
    return {"status": "ok"}


@router.delete("/me/cart")
async def clear_cart(
    current_user: TelegramInitData = Depends(get_current_user),
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
    current_user: TelegramInitData = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Оформить заказы из корзины (один заказ на каждого продавца), очистить корзину."""
    service = CartService(session)
    try:
        orders = await service.checkout(
            current_user.user.id,
            fio=data.fio,
            phone=data.phone,
            delivery_type=data.delivery_type,
            address=data.address,
        )
        await session.commit()
        return {"orders": orders}
    except CartServiceError as e:
        await session.rollback()
        _handle_cart_error(e)


# --- Visited sellers (Mini App) ---
@router.post("/me/visited-sellers")
async def record_visited_seller(
    data: VisitedSellerRecord,
    current_user: TelegramInitData = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Записать посещение магазина (для раздела «Недавно просмотренные»)."""
    visited = VisitedSellersService(session)
    await visited.record_visit(current_user.user.id, data.seller_id)
    await session.commit()
    return {"status": "ok"}


@router.get("/me/visited-sellers")
async def get_visited_sellers(
    current_user: TelegramInitData = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Список недавно посещённых магазинов."""
    visited = VisitedSellersService(session)
    return await visited.get_visited_sellers(current_user.user.id)


# --- Favorite sellers / Мои цветочные (Mini App) ---
@router.get("/me/favorite-sellers")
async def get_favorite_sellers(
    current_user: TelegramInitData = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Список избранных магазинов (мои цветочные)."""
    fav = FavoriteSellersService(session)
    return await fav.get_favorite_sellers(current_user.user.id)


@router.post("/me/favorite-sellers")
async def add_favorite_seller(
    data: VisitedSellerRecord,
    current_user: TelegramInitData = Depends(get_current_user),
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
    current_user: TelegramInitData = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Убрать магазин из «Мои цветочные»."""
    fav = FavoriteSellersService(session)
    await fav.remove(current_user.user.id, seller_id)
    await session.commit()
    return {"status": "ok"}


# --- Loyalty (Mini App: мой баланс у продавца) ---
@router.get("/me/loyalty/{seller_id}")
async def get_my_loyalty_at_seller(
    seller_id: int,
    current_user: TelegramInitData = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Баланс баллов клубной карты у данного продавца (по телефону покупателя)."""
    from backend.app.models.user import User
    user = await session.get(User, current_user.user.id)
    buyer_phone = user.phone if user else None
    if not buyer_phone:
        return {"points_balance": 0, "points_percent": 0, "card_number": None, "linked": False}
    loyalty_svc = LoyaltyService(session)
    customer = await loyalty_svc.find_customer_by_phone(seller_id, buyer_phone)
    if not customer:
        return {"points_balance": 0, "points_percent": 0, "card_number": None, "linked": False}
    points_percent = await loyalty_svc.get_points_percent(seller_id)
    return {
        "points_balance": float(customer.points_balance or 0),
        "points_percent": points_percent,
        "card_number": customer.card_number,
        "linked": True,
    }


# --- Orders (Mini App: мои заказы) ---
@router.get("/me/orders")
async def get_my_orders(
    current_user: TelegramInitData = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Заказы текущего пользователя (для Mini App)."""
    order_service = OrderService(session)
    return await order_service.get_buyer_orders(current_user.user.id)


@router.post("/me/orders/{order_id}/confirm")
async def confirm_order_received(
    order_id: int,
    current_user: TelegramInitData = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Подтвердить получение заказа (статус -> completed). Доступно только покупателю этого заказа."""
    order = await session.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.buyer_id != current_user.user.id:
        raise HTTPException(status_code=403, detail="Not your order")
    if order.status not in ("done", "in_transit", "assembling", "accepted"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot confirm: order status is {order.status}",
        )
    order_service = OrderService(session)
    try:
        result = await order_service.update_status(
            order_id,
            "completed",
            accrue_commissions_func=accrue_commissions,
        )
        await session.commit()
        return {"status": "ok", "new_status": result["new_status"]}
    except (OrderNotFoundError, InvalidOrderStatusError) as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
