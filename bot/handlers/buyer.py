# Покупатель: каталог и корзина перенесены в Mini App.
# В боте остаются только обработка "Подтвердить получение" из уведомлений.
import logging
from aiogram import Router, F, types
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from bot.api_client.orders import api_update_order_status
from bot.api_client.models import is_success

logger = logging.getLogger(__name__)
router = Router()


def _parse_order_id(callback_data: str) -> int:
    """Extract order_id from callback data like 'buyer_confirm_123'."""
    return int(callback_data.rsplit("_", 1)[1])


# --- Подтверждение получения заказа (из уведомления в ТГ) ---
@router.callback_query(F.data.startswith("buyer_confirm_"))
async def buyer_confirm_order(callback: types.CallbackQuery):
    try:
        order_id = _parse_order_id(callback.data)
    except (ValueError, IndexError):
        await callback.answer("Некорректный формат запроса", show_alert=True)
        return
    confirm_kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="✅ Да, получил", callback_data=f"buyer_received_{order_id}"),
            InlineKeyboardButton(text="❌ Нет, отмена", callback_data=f"buyer_cancel_{order_id}"),
        ]
    ])
    await callback.message.edit_reply_markup(reply_markup=confirm_kb)
    await callback.answer("Подтвердите получение заказа")


@router.callback_query(F.data.startswith("buyer_received_"))
async def buyer_received_order(callback: types.CallbackQuery):
    try:
        order_id = _parse_order_id(callback.data)
        result = await api_update_order_status(order_id, "completed")
        if is_success(result):
            await callback.answer("✅ Спасибо! Заказ отмечен как полученный.", show_alert=True)
            await callback.message.edit_text(
                (callback.message.text or "") + "\n\n✅ *ЗАКАЗ ПОЛУЧЕН*",
                parse_mode="Markdown",
            )
        else:
            await callback.answer("❌ Ошибка при обновлении статуса", show_alert=True)
    except (ValueError, IndexError):
        await callback.answer("Некорректный формат запроса", show_alert=True)
    except Exception as e:
        logger.error("Error in buyer_received_order: %s", e)
        await callback.answer("❌ Ошибка сервера", show_alert=True)


@router.callback_query(F.data.startswith("buyer_cancel_"))
async def buyer_cancel_confirm(callback: types.CallbackQuery):
    await callback.answer("Отменено")
    try:
        order_id = _parse_order_id(callback.data)
    except (ValueError, IndexError):
        return
    back_kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ Я получил заказ", callback_data=f"buyer_confirm_{order_id}")],
    ])
    await callback.message.edit_reply_markup(reply_markup=back_kb)
