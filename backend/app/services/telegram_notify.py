# backend/app/services/telegram_notify.py
"""Send Telegram notifications to buyers and sellers for order events."""
import html
import os
import re
from typing import Optional, Dict, Any, List

import httpx

from backend.app.core.logging import get_logger

logger = get_logger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_BOT_TOKEN = os.getenv("ADMIN_BOT_TOKEN")
TELEGRAM_API = "https://api.telegram.org"
MINI_APP_URL = (os.getenv("MINI_APP_URL") or "").rstrip("/")
SELLER_PANEL_URL = (os.getenv("SELLER_MINI_APP_URL") or "").rstrip("/")

SEPARATOR = "─────────────────────"


def _escape(text) -> str:
    """Escape HTML special chars in user-provided text."""
    return html.escape(str(text)) if text else ""


def _fmt_price(value: float) -> str:
    """Format price with thousands separator and ₽ sign: 5500 → '5 500 ₽'."""
    return f"{value:,.0f} ₽".replace(",", " ")


async def resolve_notification_chat_id(session, seller_id: int) -> int:
    """Resolve seller_id to the actual Telegram chat_id for notifications.

    Lookup chain: seller.contact_tg_id → seller.owner_id → seller_id (fallback).
    """
    from sqlalchemy import select
    from backend.app.models.seller import Seller
    result = await session.execute(
        select(Seller.contact_tg_id, Seller.owner_id).where(
            Seller.seller_id == seller_id
        )
    )
    row = result.first()
    if not row:
        return seller_id  # backward compat: assume seller_id is tg_id
    return row.contact_tg_id or row.owner_id

STATUS_LABELS = {
    "pending": "⏳ Ожидает подтверждения",
    "accepted": "✅ Принят продавцом",
    "assembling": "📦 Собирается",
    "in_transit": "🚚 В пути",
    "ready_for_pickup": "📦 Готов к выдаче",
    "done": "📬 Доставлен",
    "completed": "✅ Получен",
    "rejected": "❌ Отклонён продавцом",
    "cancelled": "🚫 Отменён покупателем",
}


def _format_items_for_display(items_info: str) -> str:
    """Format items_info for display in Telegram messages.

    Input:  '5:Букет роз@2500 x 2, 8:Лента@300 x 1'  (new format)
            '5:Букет роз x 2, 8:Лента x 1'            (legacy format)
    Output: '  • Букет роз × 2 — 2 500 ₽\n  • Лента × 1 — 300 ₽'
    """
    if not items_info:
        return ""
    lines = []
    for part in items_info.split(","):
        part = part.strip()
        if not part:
            continue
        # Remove 'ID:' prefix
        part = re.sub(r'^\d+:', '', part).strip()
        # Try to extract price: 'Name@Price x Qty'
        m = re.match(r'(.+?)@([\d.]+)\s*x\s*(\d+)', part, re.IGNORECASE)
        if m:
            name, price, qty = _escape(m.group(1).strip()), float(m.group(2)), m.group(3)
            lines.append(f"  • {name} × {qty} — {_fmt_price(price * int(qty))}")
        else:
            # Legacy: 'Name x Qty'
            m2 = re.match(r'(.+?)\s*x\s*(\d+)', part, re.IGNORECASE)
            if m2:
                name, qty = _escape(m2.group(1).strip()), m2.group(2)
                lines.append(f"  • {name} × {qty}")
            else:
                lines.append(f"  • {_escape(part)}")
    return "\n".join(lines)


def _items_block(items_info: str) -> str:
    """Format items as a blockquote block for notifications."""
    display = _format_items_for_display(items_info)
    if not display:
        return ""
    return f"\n\n🛒 <b>Состав:</b>\n<blockquote>{display}</blockquote>"


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
            {"text": "📱 Открыть заказ", "web_app": {"url": f"{MINI_APP_URL}/order/{order_id}"}},
        ])
    if show_confirm_button:
        rows.append([
            {"text": "✅ Я получил заказ", "callback_data": f"buyer_confirm_{order_id}"},
        ])
    return {"inline_keyboard": rows}


def _seller_order_keyboard() -> Optional[Dict[str, Any]]:
    """Inline keyboard for seller notifications — link to seller panel orders."""
    if not SELLER_PANEL_URL:
        return None
    return {"inline_keyboard": [[
        {"text": "📋 Открыть в панели управления", "url": f"{SELLER_PANEL_URL}/orders"},
    ]]}


async def _send_telegram_message(
    chat_id: int,
    text: str,
    reply_markup: Optional[Dict[str, Any]] = None,
    parse_mode: str = "HTML",
    bot_token: Optional[str] = None,
) -> bool:
    """
    Send a Telegram message. Returns True if sent successfully.
    bot_token overrides default BOT_TOKEN (used for seller notifications via ADMIN_BOT_TOKEN).
    """
    if not chat_id:
        logger.debug("No chat_id provided, skip Telegram notification (guest order?)")
        return False
    token = bot_token or BOT_TOKEN
    if not token:
        logger.warning("No bot token available, skip Telegram notification")
        return False
    payload: dict = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    url = f"{TELEGRAM_API}/bot{token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(url, json=payload)
            if r.is_success:
                return True
            # If HTML/Markdown fails, retry without parse_mode
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


# ---------------------------------------------------------------------------
#  BUYER NOTIFICATIONS
# ---------------------------------------------------------------------------


async def notify_buyer_order_created(
    buyer_id: int,
    order_id: int,
    seller_id: int,
    items_info: str = "",
    total_price: Optional[float] = None,
    is_preorder: bool = False,
    preorder_delivery_date: Optional[str] = None,
) -> bool:
    """Notify buyer that order was created."""
    if is_preorder and preorder_delivery_date:
        text = f"📋  <b>Предзаказ #{order_id} на {_escape(preorder_delivery_date)} оформлен</b>"
    else:
        text = f"📦  <b>Заказ #{order_id} оформлен</b>"
    text += "\nОжидайте подтверждения продавца."
    text += _items_block(items_info)
    if total_price is not None:
        text += f"\n\n💰 <b>Итого: {_fmt_price(total_price)}</b>"
    reply_markup = _order_notification_keyboard(order_id, seller_id)
    return await _send_telegram_message(buyer_id, text, reply_markup=reply_markup)


async def notify_buyer_order_status(
    buyer_id: int,
    order_id: int,
    new_status: str,
    seller_id: int,
    items_info: str = "",
    total_price: Optional[float] = None,
    payment_method: Optional[str] = None,
) -> bool:
    """Send a Telegram message to the buyer about order status change."""
    status_text = STATUS_LABELS.get(new_status, new_status)
    text = f"📦  <b>Заказ #{order_id}</b>"
    text += f"\n{SEPARATOR}"
    text += f"\n\n{status_text}"
    text += _items_block(items_info)
    if total_price is not None:
        text += f"\n\n💰 Итого: <b>{_fmt_price(total_price)}</b>"
    if new_status == "accepted" and payment_method == "on_pickup":
        text += "\n\n💵 Оплата при получении"
    if new_status == "done":
        text += "\n\nПодтвердите получение, нажав кнопку ниже."
    reply_markup = _order_notification_keyboard(
        order_id, seller_id, show_confirm_button=(new_status == "done"),
    )
    return await _send_telegram_message(buyer_id, text, reply_markup=reply_markup)


async def notify_buyer_order_price_changed(
    buyer_id: int,
    order_id: int,
    seller_id: int,
    new_price: float,
    items_info: str = "",
) -> bool:
    """Notify buyer that order price was changed."""
    text = f"💰  <b>Цена заказа #{order_id} изменена</b>"
    text += _items_block(items_info)
    text += f"\n\n💰 <b>Новая сумма: {_fmt_price(new_price)}</b>"
    reply_markup = _order_notification_keyboard(order_id, seller_id)
    return await _send_telegram_message(buyer_id, text, reply_markup=reply_markup)


async def notify_buyer_payment_required(
    buyer_id: int,
    order_id: int,
    seller_id: int,
    total_price: float,
    confirmation_url: str,
    items_info: str = "",
) -> bool:
    """Notify buyer that the order was accepted and payment is required."""
    text = f"✅  <b>Заказ #{order_id} принят!</b>"
    text += _items_block(items_info)
    text += f"\n\n💳 <b>К оплате: {_fmt_price(total_price)}</b>"
    text += "\nНажмите кнопку ниже, чтобы оплатить."
    text += f'\n\n💬 <a href="tg://user?id={seller_id}">Связаться с продавцом</a>'
    rows = [
        [{"text": "💳 Оплатить", "url": confirmation_url}],
    ]
    if MINI_APP_URL:
        rows.append([
            {"text": "📱 Открыть заказ", "web_app": {"url": f"{MINI_APP_URL}/order/{order_id}"}},
        ])
    reply_markup = {"inline_keyboard": rows}
    return await _send_telegram_message(buyer_id, text, reply_markup=reply_markup)


async def notify_buyer_payment_succeeded(
    buyer_id: int,
    order_id: int,
    seller_id: int,
) -> bool:
    """Notify buyer that their payment was successful."""
    text = f"✅  <b>Заказ #{order_id} оплачен!</b>"
    text += "\n\nПродавец начнёт сборку в ближайшее время."
    reply_markup = _order_notification_keyboard(order_id, seller_id)
    return await _send_telegram_message(buyer_id, text, reply_markup=reply_markup)


async def notify_buyer_payment_refunded(
    buyer_id: int,
    order_id: int,
    seller_id: int,
    refund_amount: float,
) -> bool:
    """Notify buyer that their payment is being refunded."""
    text = f"💸  <b>Возврат по заказу #{order_id}</b>"
    text += f"\n\nСумма <b>{_fmt_price(refund_amount)}</b> будет возвращена на карту в течение нескольких дней."
    reply_markup = _order_notification_keyboard(order_id, seller_id)
    return await _send_telegram_message(buyer_id, text, reply_markup=reply_markup)


async def notify_preorder_reminder_buyer(
    buyer_id: int,
    order_id: int,
    seller_id: int,
    preorder_delivery_date: str,
    items_info: str = "",
) -> bool:
    """Remind buyer about upcoming preorder delivery (1 day before)."""
    text = f"📋  <b>Напоминание</b>"
    text += f"\n\nВаш предзаказ <b>#{order_id}</b> на <b>{_escape(preorder_delivery_date)}</b> будет выполнен завтра."
    text += _items_block(items_info)
    reply_markup = _order_notification_keyboard(order_id, seller_id)
    return await _send_telegram_message(buyer_id, text, reply_markup=reply_markup)


async def notify_subscriber_preorder_opened(
    buyer_id: int,
    shop_name: str,
    seller_id: int,
    message: str = "",
) -> bool:
    """Notify a subscriber that a seller opened preorders."""
    text = f"🌸  <b>{_escape(shop_name)} открыл предзаказы!</b>"
    if message:
        text += f"\n\n{_escape(message)}"
    text += f'\n\n📱 <a href="tg://user?id={seller_id}">Оформить предзаказ →</a>'
    return await _send_telegram_message(buyer_id, text)


# ---------------------------------------------------------------------------
#  SELLER NOTIFICATIONS (sent via ADMIN_BOT_TOKEN)
# ---------------------------------------------------------------------------


def _build_delivery_block(
    delivery_type: Optional[str],
    delivery_zone_name: Optional[str],
    delivery_fee: Optional[float],
) -> str:
    """Build delivery info block for seller notifications."""
    if not delivery_type:
        return ""
    text = f"\n\n🚚 {_escape(delivery_type)}"
    if delivery_zone_name:
        text += f" — зона «{_escape(delivery_zone_name)}»"
    if delivery_fee is not None and delivery_fee > 0:
        text += f"\n      Стоимость: {_fmt_price(delivery_fee)}"
    elif delivery_fee == 0 and delivery_type == "Доставка":
        text += "\n      Бесплатно"
    return text


def _build_recipient_block(
    recipient_name: Optional[str],
    recipient_phone: Optional[str],
    gift_note: Optional[str],
) -> str:
    """Build recipient info block for seller notifications."""
    if not recipient_name:
        return ""
    text = f"\n\n🎁 <b>Получатель</b>"
    text += f"\n      {_escape(recipient_name)}"
    if recipient_phone:
        text += f"  ({_escape(recipient_phone)})"
    if gift_note:
        text += f"\n      💌 «{_escape(gift_note)}»"
    return text


async def notify_seller_new_order(
    seller_id: int,
    order_id: int,
    items_info: str = "",
    total_price: Optional[float] = None,
    is_preorder: bool = False,
    preorder_delivery_date: Optional[str] = None,
    delivery_type: Optional[str] = None,
    delivery_fee: Optional[float] = None,
    delivery_zone_name: Optional[str] = None,
    recipient_name: Optional[str] = None,
    recipient_phone: Optional[str] = None,
    gift_note: Optional[str] = None,
) -> bool:
    """Notify seller about new order."""
    if is_preorder and preorder_delivery_date:
        text = f"📋  <b>Новый предзаказ #{order_id}</b>\n<i>на {_escape(preorder_delivery_date)}</i>"
    else:
        text = f"🆕  <b>Новый заказ #{order_id}</b>"
    text += f"\n{SEPARATOR}"
    text += _items_block(items_info)
    if total_price is not None:
        text += f"\n\n💰 <b>Итого: {_fmt_price(total_price)}</b>"
    text += _build_delivery_block(delivery_type, delivery_zone_name, delivery_fee)
    text += _build_recipient_block(recipient_name, recipient_phone, gift_note)
    return await _send_telegram_message(
        seller_id, text, reply_markup=_seller_order_keyboard(),
        bot_token=ADMIN_BOT_TOKEN,
    )


async def notify_seller_new_order_guest(
    seller_id: int,
    order_id: int,
    items_info: str = "",
    total_price: Optional[float] = None,
    guest_name: str = "",
    guest_phone: str = "",
    delivery_type: Optional[str] = None,
    delivery_fee: Optional[float] = None,
    delivery_zone_name: Optional[str] = None,
    recipient_name: Optional[str] = None,
    recipient_phone: Optional[str] = None,
    gift_note: Optional[str] = None,
) -> bool:
    """Notify seller about new guest order (web checkout, no Telegram account)."""
    text = f"🆕  <b>Новый заказ #{order_id}</b>  <i>(гость)</i>"
    text += f"\n{SEPARATOR}"
    text += _items_block(items_info)
    if total_price is not None:
        text += f"\n\n💰 <b>Итого: {_fmt_price(total_price)}</b>"
    text += _build_delivery_block(delivery_type, delivery_zone_name, delivery_fee)
    text += f"\n\n👤 <b>Покупатель</b>"
    text += f"\n      {_escape(guest_name)}  ({_escape(guest_phone)})"
    text += _build_recipient_block(recipient_name, recipient_phone, gift_note)
    return await _send_telegram_message(
        seller_id, text, reply_markup=_seller_order_keyboard(),
        bot_token=ADMIN_BOT_TOKEN,
    )


async def notify_seller_order_completed(seller_id: int, order_id: int) -> bool:
    """Notify seller that buyer confirmed receipt."""
    text = f"✅  <b>Заказ #{order_id} — получен</b>"
    text += "\n\nПокупатель подтвердил получение."
    return await _send_telegram_message(seller_id, text, bot_token=ADMIN_BOT_TOKEN)


async def notify_seller_preorder_cancelled(
    seller_id: int,
    order_id: int,
    items_info: str = "",
    preorder_delivery_date: Optional[str] = None,
) -> bool:
    """Notify seller that a preorder was cancelled by the buyer."""
    text = f"🚫  <b>Предзаказ #{order_id} отменён</b>"
    if preorder_delivery_date:
        text += f"\n<i>на {_escape(preorder_delivery_date)}</i>"
    text += _items_block(items_info)
    return await _send_telegram_message(seller_id, text, bot_token=ADMIN_BOT_TOKEN)


async def notify_seller_order_cancelled(
    seller_id: int,
    order_id: int,
    items_info: str = "",
) -> bool:
    """Notify seller that a regular order was cancelled by the buyer."""
    text = f"🚫  <b>Заказ #{order_id} отменён</b>"
    text += _items_block(items_info)
    return await _send_telegram_message(seller_id, text, bot_token=ADMIN_BOT_TOKEN)


async def notify_preorder_summary_seller(
    seller_id: int,
    delivery_date: str,
    orders_count: int,
    total_amount: float,
    items_summary: str = "",
) -> bool:
    """Send seller a summary of preorders for an upcoming date."""
    text = f"📋  <b>Предзаказы на {_escape(delivery_date)}</b>"
    text += f"\n{SEPARATOR}"
    text += f"\n\n📦 Заказов: <b>{orders_count}</b>"
    text += f"\n💰 Сумма: <b>{_fmt_price(total_amount)}</b>"
    if items_summary:
        text += f"\n\n📝 <b>Что подготовить:</b>\n<blockquote>{_escape(items_summary)}</blockquote>"
    return await _send_telegram_message(seller_id, text, bot_token=ADMIN_BOT_TOKEN)


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
            when = "<b>сегодня!</b>"
        elif days == 1:
            when = "<b>завтра!</b>"
        else:
            when = f"через {days} дн."
        name = _escape(ev.get("customer_name", "—"))
        title = _escape(ev.get("title", ""))
        lines.append(f"  {name} — {title} ({when})")
    text = f"📅  <b>Предстоящие события</b>"
    text += f"\n{SEPARATOR}"
    text += f"\n\n<blockquote>" + "\n".join(lines) + "</blockquote>"
    return await _send_telegram_message(seller_id, text, bot_token=ADMIN_BOT_TOKEN)


async def notify_seller_payment_received(
    seller_id: int,
    order_id: int,
    total_price: float = 0,
) -> bool:
    """Notify seller that payment was received for an order."""
    text = f"💰  <b>Оплата получена</b>"
    text += f"\n\nЗаказ <b>#{order_id}</b>"
    if total_price:
        text += f" — {_fmt_price(total_price)}"
    text += "\nМожно начинать сборку."
    return await _send_telegram_message(
        seller_id, text, reply_markup=_seller_order_keyboard(),
        bot_token=ADMIN_BOT_TOKEN,
    )


async def notify_seller_payment_refunded(
    seller_id: int,
    order_id: int,
    refund_amount: float,
) -> bool:
    """Notify seller that a refund was issued for an order."""
    text = f"💸  <b>Возврат по заказу #{order_id}</b>"
    text += f"\n\nСумма: <b>{_fmt_price(refund_amount)}</b>"
    text += "\nСредства будут возвращены покупателю."
    return await _send_telegram_message(seller_id, text, bot_token=ADMIN_BOT_TOKEN)


# --- Subscription notifications ---


async def notify_seller_subscription_activated(
    seller_id: int,
    period_months: int,
    expires_at,
) -> bool:
    """Notify seller that subscription was activated."""
    expires_str = expires_at.strftime("%d.%m.%Y") if expires_at else "—"
    text = f"✅  <b>Подписка Flurai активирована</b>"
    text += f"\n\nПериод: <b>{period_months} мес.</b>"
    text += f"\nДействует до <b>{expires_str}</b>"
    return await _send_telegram_message(seller_id, text, bot_token=ADMIN_BOT_TOKEN)


async def notify_seller_subscription_expiring(
    seller_id: int,
    days_label: str,
    expires_at,
) -> bool:
    """Notify seller that subscription expires soon."""
    expires_str = expires_at.strftime("%d.%m.%Y") if expires_at else "—"
    text = f"⚠️  <b>Подписка Flurai истекает</b>"
    text += f"\n\nОсталось: <b>{_escape(days_label)}</b> ({expires_str})"
    text += "\nПродлите подписку, чтобы продолжить принимать заказы."
    return await _send_telegram_message(seller_id, text, bot_token=ADMIN_BOT_TOKEN)


async def notify_seller_subscription_expired(seller_id: int) -> bool:
    """Notify seller that subscription has expired."""
    text = f"🔴  <b>Подписка Flurai истекла</b>"
    text += "\n\nМагазин не может принимать заказы."
    text += "\nПродлите подписку в панели управления."
    return await _send_telegram_message(seller_id, text, bot_token=ADMIN_BOT_TOKEN)
