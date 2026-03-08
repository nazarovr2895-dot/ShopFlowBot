---
name: sending-telegram-notification
description: Send Telegram notifications using Flurai's notification system. Use when adding new notification types for buyers or sellers, or modifying existing notification messages.
argument-hint: [notification-description]
---

# Sending Telegram Notifications

All notifications go through `backend/app/services/telegram_notify.py`. **Always use the existing helpers** — never send Telegram messages directly.

## Existing Helpers

```python
from backend.app.services.telegram_notify import (
    _escape,                        # HTML escape user input
    _fmt_price,                     # 5500 → '5 500 ₽'
    _format_items_for_display,      # items_info → formatted bullet list
    resolve_notification_chat_id,   # seller_id → actual chat_id
    _send_telegram_message,         # Send via Telegram Bot API
    STATUS_LABELS,                  # Status → emoji label mapping
    SEPARATOR,                      # "─────────────────────"
    BOT_TOKEN,                      # For buyer notifications
    ADMIN_BOT_TOKEN,                # For seller notifications
    MINI_APP_URL,                   # Mini App link base
    SELLER_PANEL_URL,               # Seller panel link base
)
```

## Chat ID Resolution

**Never send to `seller_id` directly.** Use the lookup chain:

```python
chat_id = await resolve_notification_chat_id(session, seller_id)
# Lookup: seller.contact_tg_id → seller.owner_id → seller_id (fallback)
```

## Bot Token Selection

| Recipient | Token | Why |
|-----------|-------|-----|
| Buyer | `BOT_TOKEN` | Main bot, buyer already interacts with it |
| Seller | `ADMIN_BOT_TOKEN` | Separate admin bot for seller notifications |

## Message Sending

```python
success = await _send_telegram_message(
    chat_id=chat_id,
    text=message_text,
    reply_markup=keyboard,           # Optional inline keyboard
    parse_mode="HTML",               # Always HTML
    bot_token=ADMIN_BOT_TOKEN,       # Override for seller notifications
)
```

**Error handling**: `_send_telegram_message` returns `bool`, logs warnings internally. Notifications are non-critical — never throw on failure.

## Message Format Conventions

### Template:
```python
text = (
    f"<b>Заказ №{order_id}</b>\n"
    f"{SEPARATOR}\n"
    f"\n"
    f"<blockquote>{items_display}</blockquote>\n"
    f"\n"
    f"Сумма: <b>{_fmt_price(total)}</b>\n"
    f"Статус: {STATUS_LABELS.get(status, status)}\n"
)
```

### Rules:
- **Russian only** — all user-facing text
- **HTML format** — `<b>bold</b>`, `<blockquote>`, `<a href="">link</a>`
- **Always escape user input**: `_escape(user_name)`, `_escape(address)`
- **Price formatting**: `_fmt_price(value)` → `"5 500 ₽"`
- **Items display**: `_format_items_for_display(items_info)` → bullet list
- **Status labels**: `STATUS_LABELS[status]` → `"✅ Принят продавцом"`
- **Separator**: `SEPARATOR` between sections

### Status Emojis (from STATUS_LABELS):
```
pending     → ⏳ Ожидает подтверждения
accepted    → ✅ Принят продавцом
assembling  → 📦 Собирается
in_transit  → 🚚 В пути
ready_for_pickup → 📦 Готов к выдаче
done        → 📬 Доставлен
completed   → ✅ Получен
rejected    → ❌ Отклонён продавцом
cancelled   → 🚫 Отменён покупателем
```

## Inline Keyboard Pattern

```python
def _my_notification_keyboard(order_id: int) -> dict:
    return {
        "inline_keyboard": [[
            {
                "text": "Открыть заказ",
                "web_app": {"url": f"{MINI_APP_URL}/orders/{order_id}"}
            }
        ]]
    }
```

For seller notifications, use `SELLER_PANEL_URL`:
```python
{"text": "Открыть в панели", "url": f"{SELLER_PANEL_URL}/orders?id={order_id}"}
```

## Adding a New Notification

1. Create function in `backend/app/services/telegram_notify.py`:
```python
async def notify_buyer_my_event(
    session,
    buyer_tg_id: int,
    order_id: int,
    # ... other params
):
    """Notify buyer about my event."""
    text = (
        f"<b>Заголовок</b>\n"
        f"{SEPARATOR}\n"
        f"Текст уведомления\n"
    )
    keyboard = _order_notification_keyboard(order_id)
    await _send_telegram_message(
        chat_id=buyer_tg_id,
        text=text,
        reply_markup=keyboard,
    )
```

2. Call from service or endpoint:
```python
from backend.app.services.telegram_notify import notify_buyer_my_event
await notify_buyer_my_event(session, buyer_tg_id, order_id)
```

## Reference File

Read `backend/app/services/telegram_notify.py` for all existing notification functions and helpers.
