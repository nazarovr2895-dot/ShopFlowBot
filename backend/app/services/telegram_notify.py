# backend/app/services/telegram_notify.py
"""Send Telegram notifications to buyers and sellers for order events."""
import os
import re
from typing import Optional, Dict, Any, List

import httpx

from backend.app.core.logging import get_logger

logger = get_logger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN")
TELEGRAM_API = "https://api.telegram.org"
MINI_APP_URL = (os.getenv("MINI_APP_URL") or "").rstrip("/")

STATUS_LABELS = {
    "pending": "⏳ Ожидает подтверждения продавцом",
    "accepted": "✅ Заказ принят продавцом",
    "assembling": "📦 Заказ собирается",
    "in_transit": "🚚 Заказ в пути",
    "ready_for_pickup": "📦 Заказ готов к выдаче",
    "done": "📬 Заказ выполнен. Подтвердите получение.",
    "completed": "✅ Заказ получен",
    "rejected": "❌ Заказ отклонён продавцом",
    "cancelled": "🚫 Предзаказ отменён покупателем",
}


def _format_items_for_display(items_info: str) -> str:
    """
    Clean items_info for display in Telegram messages.
    Removes product IDs (e.g. '5:Букет роз x 1' → 'Букет роз × 1').
    """
    if not items_info:
        return ""
    # Remove 'ID:' prefix and replace 'x' with '×'
    cleaned = re.sub(r'\d+:', '', items_info)
    cleaned = re.sub(r'\s*x\s*', ' × ', cleaned)
    return cleaned.strip()


def _order_notification_keyboard(
    order_id: int,
    seller_id: int,
    show_confirm_button: bool = False,
) -> Dict[str, Any]:
    """
    Inline keyboard with buttons: Open order in platform, (optionally) I received order.
    show_confirm_button=True only when order status is "done" (delivered).
    """
    rows = []
    if MINI_APP_URL:
        rows.append([
            {"text": "📱 Открыть заказ в платформе", "web_app": {"url": f"{MINI_APP_URL}/order/{order_id}"}},
        ])
    if show_confirm_button:
        rows.append([
            {"text": "✅ Я получил заказ", "callback_data": f"buyer_confirm_{order_id}"},
        ])
    return {"inline_keyboard": rows}


async def _send_telegram_message(
    chat_id: int,
    text: str,
    reply_markup: Optional[Dict[str, Any]] = None,
    parse_mode: str = "Markdown",
) -> bool:
    """
    Send a Telegram message. Returns True if sent successfully.
    """
    if not chat_id:
        logger.debug("No chat_id provided, skip Telegram notification (guest order?)")
        return False
    if not BOT_TOKEN:
        logger.warning("BOT_TOKEN not set, skip Telegram notification")
        return False
    payload: dict = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    url = f"{TELEGRAM_API}/bot{BOT_TOKEN}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(url, json=payload)
            if r.is_success:
                return True
            # If Markdown fails, retry without parse_mode
            if r.status_code == 400 and parse_mode:
                logger.info(
                    "Telegram sendMessage 400 with %s, retrying without parse_mode (chat=%s)",
                    parse_mode, chat_id,
                )
                payload.pop("parse_mode", None)
                r2 = await client.post(url, json=payload)
                if r2.is_success:
                    return True
                logger.warning(
                    "Telegram sendMessage retry also failed: status=%s body=%s",
                    r2.status_code, r2.text[:500],
                )
                return False
            logger.warning(
                "Telegram sendMessage failed: chat_id=%s status=%s body=%s",
                chat_id, r.status_code, r.text[:500],
            )
            return False
    except Exception as e:
        logger.exception("Telegram _send_telegram_message failed: %s", e)
        return False


async def notify_buyer_order_created(
    buyer_id: int,
    order_id: int,
    seller_id: int,
    items_info: str = "",
    total_price: Optional[float] = None,
    is_preorder: bool = False,
    preorder_delivery_date: Optional[str] = None,
) -> bool:
    """
    Notify buyer that order was created. "Заказ #N оформлен. Ожидайте подтверждения продавца."
    Includes 3 buttons: open order, contact seller, I received order.
    """
    if is_preorder and preorder_delivery_date:
        text = f"📋 Предзаказ #{order_id} на {preorder_delivery_date} оформлен. Ожидайте подтверждения продавца."
    else:
        text = f"📦 Заказ #{order_id} оформлен. Ожидайте подтверждения продавца."
    display_items = _format_items_for_display(items_info)
    if display_items:
        text += f"\n\n🛒 {display_items}"
    if total_price is not None:
        text += f"\n💰 Сумма: {total_price:.0f} руб."
    reply_markup = _order_notification_keyboard(order_id, seller_id)
    return await _send_telegram_message(buyer_id, text, reply_markup=reply_markup)


async def notify_seller_new_order(
    seller_id: int,
    order_id: int,
    items_info: str = "",
    total_price: Optional[float] = None,
    is_preorder: bool = False,
    preorder_delivery_date: Optional[str] = None,
) -> bool:
    """
    Notify seller about new order. Принять/отклонить — в админ-панели.
    """
    if is_preorder and preorder_delivery_date:
        text = f"📋 Новый предзаказ #{order_id} на {preorder_delivery_date}"
    else:
        text = f"🆕 Новый заказ #{order_id}"
    if total_price is not None:
        text += f"\n💰 Сумма: {total_price:.0f} руб."
    display_items = _format_items_for_display(items_info)
    if display_items:
        text += f"\n\n🛒 {display_items}"
    text += "\n\nПринять или отклонить заказ — в админ-панели."
    return await _send_telegram_message(seller_id, text)


async def notify_seller_order_completed(seller_id: int, order_id: int) -> bool:
    """
    Notify seller that buyer confirmed receipt. "Покупатель подтвердил получение заказа #N."
    """
    text = f"✅ Покупатель подтвердил получение заказа #{order_id}."
    return await _send_telegram_message(seller_id, text)


async def notify_buyer_order_price_changed(
    buyer_id: int,
    order_id: int,
    seller_id: int,
    new_price: float,
    items_info: str = "",
) -> bool:
    """
    Notify buyer that order price was changed. "Цена заказа #N изменена на X руб."
    Includes 3 buttons: open order, contact seller, I received order.
    """
    text = f"💰 Цена заказа #{order_id} изменена на {new_price:.0f} руб."
    display_items = _format_items_for_display(items_info)
    if display_items:
        text += f"\n\n🛒 {display_items}"
    reply_markup = _order_notification_keyboard(order_id, seller_id)
    return await _send_telegram_message(buyer_id, text, reply_markup=reply_markup)


async def notify_buyer_order_status(
    buyer_id: int,
    order_id: int,
    new_status: str,
    seller_id: int,
    items_info: str = "",
    total_price: Optional[float] = None,
) -> bool:
    """
    Send a Telegram message to the buyer about order status change.
    Under every notification: 3 buttons — open order in platform, contact seller, I received order.
    Returns True if sent successfully.
    """
    text = f"📦 Заказ #{order_id}\n\nСтатус: {STATUS_LABELS.get(new_status, new_status)}"
    display_items = _format_items_for_display(items_info)
    if display_items:
        text += f"\n\n🛒 {display_items}"
    if total_price is not None:
        text += f"\n💰 Сумма: {total_price:.0f} руб."
    # Show "I received order" button only when order is delivered
    reply_markup = _order_notification_keyboard(
        order_id, seller_id, show_confirm_button=(new_status == "done"),
    )
    return await _send_telegram_message(buyer_id, text, reply_markup=reply_markup)


async def notify_seller_preorder_cancelled(
    seller_id: int,
    order_id: int,
    items_info: str = "",
    preorder_delivery_date: Optional[str] = None,
) -> bool:
    """Notify seller that a preorder was cancelled by the buyer."""
    date_part = f" на {preorder_delivery_date}" if preorder_delivery_date else ""
    text = f"🚫 Предзаказ #{order_id}{date_part} отменён покупателем."
    display_items = _format_items_for_display(items_info)
    if display_items:
        text += f"\n\n🛒 {display_items}"
    return await _send_telegram_message(seller_id, text)


async def notify_seller_order_cancelled(
    seller_id: int,
    order_id: int,
    items_info: str = "",
) -> bool:
    """Notify seller that a regular order was cancelled by the buyer."""
    text = f"🚫 Заказ #{order_id} отменён покупателем."
    display_items = _format_items_for_display(items_info)
    if display_items:
        text += f"\n\n🛒 {display_items}"
    return await _send_telegram_message(seller_id, text)


async def notify_preorder_reminder_buyer(
    buyer_id: int,
    order_id: int,
    seller_id: int,
    preorder_delivery_date: str,
    items_info: str = "",
) -> bool:
    """Remind buyer about upcoming preorder delivery (1 day before)."""
    text = f"📋 Напоминание: ваш предзаказ #{order_id} на {preorder_delivery_date} будет выполнен завтра."
    display_items = _format_items_for_display(items_info)
    if display_items:
        text += f"\n\n🛒 {display_items}"
    reply_markup = _order_notification_keyboard(order_id, seller_id)
    return await _send_telegram_message(buyer_id, text, reply_markup=reply_markup)


async def notify_preorder_summary_seller(
    seller_id: int,
    delivery_date: str,
    orders_count: int,
    total_amount: float,
    items_summary: str = "",
) -> bool:
    """Send seller a summary of preorders for an upcoming date."""
    text = f"📋 Предзаказы на {delivery_date}\n\n"
    text += f"📦 Заказов: {orders_count}\n"
    text += f"💰 Общая сумма: {total_amount:.0f} руб."
    if items_summary:
        text += f"\n\n📝 Что нужно подготовить:\n{items_summary}"
    return await _send_telegram_message(seller_id, text)


async def notify_subscriber_preorder_opened(
    buyer_id: int,
    shop_name: str,
    seller_id: int,
    message: str = "",
) -> bool:
    """Notify a subscriber that a seller opened preorders (e.g., for a holiday)."""
    text = f"🌸 {shop_name} открыл предзаказы!"
    if message:
        text += f"\n\n{message}"
    text += f"\n\n📱 Оформить предзаказ → tg://user?id={seller_id}"
    return await _send_telegram_message(buyer_id, text)


async def notify_seller_upcoming_events(
    seller_id: int,
    events: List[Dict[str, Any]],
) -> bool:
    """Send daily event reminder to seller via Telegram bot."""
    if not events:
        return False
    lines = []
    for ev in events:
        days = ev.get("days_until", 0)
        if days == 0:
            when = "сегодня!"
        elif days == 1:
            when = "завтра!"
        else:
            when = f"через {days} дн."
        name = ev.get("customer_name", "—")
        title = ev.get("title", "")
        lines.append(f"  {name} — {title} ({when})")
    text = "📅 Предстоящие события клиентов:\n\n" + "\n".join(lines)
    return await _send_telegram_message(seller_id, text)


async def notify_buyer_payment_required(
    buyer_id: int,
    order_id: int,
    seller_id: int,
    total_price: float,
    confirmation_url: str,
    items_info: str = "",
) -> bool:
    """
    Notify buyer that the order was accepted and payment is required.
    Sends an inline button with the YuKassa payment link.
    """
    text = f"✅ Заказ #{order_id} принят продавцом!"
    display_items = _format_items_for_display(items_info)
    if display_items:
        text += f"\n\n🛒 {display_items}"
    text += f"\n💰 К оплате: {total_price:.0f} руб."
    text += "\n\n💳 Нажмите кнопку ниже, чтобы оплатить заказ."
    text += f"\n\n💬 Связаться с продавцом: tg://user?id={seller_id}"

    rows = [
        [{"text": "💳 Оплатить", "url": confirmation_url}],
    ]
    if MINI_APP_URL:
        rows.append([
            {"text": "📱 Открыть заказ", "web_app": {"url": f"{MINI_APP_URL}/order/{order_id}"}},
        ])
    reply_markup = {"inline_keyboard": rows}
    return await _send_telegram_message(buyer_id, text, reply_markup=reply_markup)


async def notify_seller_new_order_guest(
    seller_id: int,
    order_id: int,
    items_info: str = "",
    total_price: Optional[float] = None,
    guest_name: str = "",
    guest_phone: str = "",
) -> bool:
    """Notify seller about new guest order (web checkout, no Telegram account)."""
    text = f"🆕 Новый заказ #{order_id} (гость)"
    if total_price is not None:
        text += f"\n💰 Сумма: {total_price:.0f} руб."
    display_items = _format_items_for_display(items_info)
    if display_items:
        text += f"\n\n🛒 {display_items}"
    text += f"\n\n👤 Покупатель: {guest_name}"
    text += f"\n📞 Телефон: {guest_phone}"
    text += "\n\nПринять или отклонить заказ — в админ-панели."
    return await _send_telegram_message(seller_id, text)


async def notify_buyer_payment_succeeded(
    buyer_id: int,
    order_id: int,
    seller_id: int,
) -> bool:
    """Notify buyer that their payment was successful."""
    text = f"✅ Заказ #{order_id} оплачен!\n\nПродавец начнёт сборку в ближайшее время."
    reply_markup = _order_notification_keyboard(order_id, seller_id)
    return await _send_telegram_message(buyer_id, text, reply_markup=reply_markup)


async def notify_seller_payment_received(
    seller_id: int,
    order_id: int,
    total_price: float = 0,
) -> bool:
    """Notify seller that payment was received for an order."""
    text = f"💰 Оплата получена! Заказ #{order_id} оплачен"
    if total_price:
        text += f" ({total_price:.0f} руб.)"
    text += ".\n\nМожно начинать сборку."
    return await _send_telegram_message(seller_id, text)


# --- Subscription notifications ---


async def notify_seller_subscription_activated(
    seller_id: int,
    period_months: int,
    expires_at,
) -> bool:
    """Notify seller that subscription was activated."""
    expires_str = expires_at.strftime("%d.%m.%Y") if expires_at else "—"
    text = (
        f"✅ Подписка Flurai активирована на {period_months} мес.!\n"
        f"Действует до {expires_str}."
    )
    return await _send_telegram_message(seller_id, text)


async def notify_seller_subscription_expiring(
    seller_id: int,
    days_label: str,
    expires_at,
) -> bool:
    """Notify seller that subscription expires soon."""
    expires_str = expires_at.strftime("%d.%m.%Y") if expires_at else "—"
    text = (
        f"⚠️ Подписка Flurai истекает через {days_label} ({expires_str}).\n\n"
        "Продлите подписку, чтобы продолжить принимать заказы."
    )
    return await _send_telegram_message(seller_id, text)


async def notify_seller_subscription_expired(seller_id: int) -> bool:
    """Notify seller that subscription has expired."""
    text = (
        "🔴 Ваша подписка Flurai истекла.\n\n"
        "Магазин не может принимать заказы. "
        "Продлите подписку в панели управления."
    )
    return await _send_telegram_message(seller_id, text)
