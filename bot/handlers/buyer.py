# Покупатель: каталог и корзина перенесены в Mini App.
# В боте остаются только обработка "Подтвердить получение" из уведомлений.
from aiogram import Router, F, types
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from bot.api_client.orders import api_update_order_status

router = Router()


# --- Подтверждение получения заказа (из уведомления в ТГ) ---
@router.callback_query(F.data.startswith("buyer_confirm_"))
async def buyer_confirm_order(callback: types.CallbackQuery):
    order_id = int(callback.data.split("_")[2])
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
    order_id = int(callback.data.split("_")[2])
    result = await api_update_order_status(order_id, "completed")
    if result and result.get("status") == "ok":
        await callback.answer("✅ Спасибо! Заказ отмечен как полученный.", show_alert=True)
        await callback.message.edit_text(
            (callback.message.text or "") + "\n\n✅ *ЗАКАЗ ПОЛУЧЕН*",
            parse_mode="Markdown",
        )
    else:
        await callback.answer("❌ Ошибка при обновлении статуса", show_alert=True)


@router.callback_query(F.data.startswith("buyer_cancel_"))
async def buyer_cancel_confirm(callback: types.CallbackQuery):
    await callback.answer("Отменено")
    order_id = int(callback.data.split("_")[2])
    back_kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ Я получил заказ", callback_data=f"buyer_confirm_{order_id}")],
    ])
    await callback.message.edit_reply_markup(reply_markup=back_kb)
