# backend/app/services/telegram_notify.py
"""Send Telegram notifications to buyers and sellers for order events."""
import os
import logging
from typing import Optional, Dict, Any

import httpx

logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN")
TELEGRAM_API = "https://api.telegram.org"
MINI_APP_URL = (os.getenv("MINI_APP_URL") or "").rstrip("/")

STATUS_LABELS = {
    "pending": "⏳ Ожидает подтверждения продавцом",
    "accepted": "✅ Заказ принят продавцом",
    "assembling": "📦 Заказ собирается",
    "in_transit": "🚚 Заказ в пути",
    "done": "📬 Заказ доставлен. Подтвердите получение.",
    "completed": "✅ Заказ получен",
    "rejected": "❌ Заказ отклонён продавцом",
}


def _order_notification_keyboard(order_id: int, seller_id: int) -> Dict[str, Any]:
    """
    Inline keyboard with 3 buttons: Open order in platform, Contact seller, I received order.
    """
    rows = []
    if MINI_APP_URL:
        rows.append([
            {"text": "📱 Открыть заказ в платформе", "url": f"{MINI_APP_URL}/order/{order_id}"},
        ])
    rows.append([
        {"text": "💬 Связаться с продавцом", "url": f"tg://user?id={seller_id}"},
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
            logger.warning(
                "Telegram sendMessage failed",
                chat_id=chat_id,
                status_code=r.status_code,
                body=r.text[:500],
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
) -> bool:
    """
    Notify buyer that order was created. "Заказ #N оформлен. Ожидайте подтверждения продавца."
    Includes 3 buttons: open order, contact seller, I received order.
    """
    text = f"📦 *Заказ #{order_id}* оформлен. Ожидайте подтверждения продавца."
    if items_info:
        text += f"\n\n🛒 {items_info}"
    if total_price is not None:
        text += f"\n💰 Сумма: {total_price:.0f} руб."
    reply_markup = _order_notification_keyboard(order_id, seller_id)
    return await _send_telegram_message(buyer_id, text, reply_markup=reply_markup)


async def notify_seller_new_order(
    seller_id: int,
    order_id: int,
    items_info: str = "",
    total_price: Optional[float] = None,
) -> bool:
    """
    Notify seller about new order. Принять/отклонить — в админ-панели.
    """
    text = f"🆕 Новый заказ *#{order_id}*"
    if total_price is not None:
        text += f"\n💰 Сумма: {total_price:.0f} руб."
    if items_info:
        text += f"\n\n🛒 {items_info}"
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
    text = f"💰 Цена заказа *#{order_id}* изменена на *{new_price:.0f}* руб."
    if items_info:
        text += f"\n\n🛒 {items_info}"
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
    text = f"📦 *Заказ #{order_id}*\n\nСтатус: {STATUS_LABELS.get(new_status, new_status)}"
    if items_info:
        text += f"\n\n🛒 {items_info}"
    if total_price is not None:
        text += f"\n💰 Сумма: {total_price:.0f} руб."
    reply_markup = _order_notification_keyboard(order_id, seller_id)
    return await _send_telegram_message(buyer_id, text, reply_markup=reply_markup)
