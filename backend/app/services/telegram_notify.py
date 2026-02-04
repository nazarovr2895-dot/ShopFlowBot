# backend/app/services/telegram_notify.py
"""Send Telegram notifications to buyers when order status changes."""
import os
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN")
TELEGRAM_API = "https://api.telegram.org"

STATUS_LABELS = {
    "pending": "⏳ Ожидает подтверждения продавцом",
    "accepted": "✅ Заказ принят продавцом",
    "assembling": "📦 Заказ собирается",
    "in_transit": "🚚 Заказ в пути",
    "done": "📬 Заказ доставлен. Подтвердите получение.",
    "completed": "✅ Заказ получен",
    "rejected": "❌ Заказ отклонён продавцом",
}


async def notify_buyer_order_status(
    buyer_id: int,
    order_id: int,
    new_status: str,
    items_info: str = "",
    total_price: Optional[float] = None,
) -> bool:
    """
    Send a Telegram message to the buyer about order status change.
    If status is 'done', include inline button "Подтвердить получение".
    Returns True if sent successfully.
    """
    if not BOT_TOKEN:
        logger.warning("BOT_TOKEN not set, skip buyer notification")
        return False
    text = f"📦 *Заказ #{order_id}*\n\nСтатус: {STATUS_LABELS.get(new_status, new_status)}"
    if items_info:
        text += f"\n\n🛒 {items_info}"
    if total_price is not None:
        text += f"\n💰 Сумма: {total_price:.0f} руб."
    payload: dict = {
        "chat_id": buyer_id,
        "text": text,
        "parse_mode": "Markdown",
    }
    if new_status == "done":
        payload["reply_markup"] = {
            "inline_keyboard": [
                [
                    {"text": "✅ Подтвердить получение", "callback_data": f"buyer_confirm_{order_id}"},
                ]
            ]
        }
    url = f"{TELEGRAM_API}/bot{BOT_TOKEN}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(url, json=payload)
            if r.is_success:
                return True
            logger.warning(
                "Telegram sendMessage failed",
                buyer_id=buyer_id,
                order_id=order_id,
                status_code=r.status_code,
                body=r.text[:500],
            )
            return False
    except Exception as e:
        logger.exception("Telegram notify_buyer_order_status failed: %s", e)
        return False
