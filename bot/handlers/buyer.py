# Покупатель: каталог и корзина перенесены в Mini App.
# В боте остаются только редирект в Mini App и обработка "Подтвердить получение" из уведомлений.
from aiogram import Router, F, types
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, KeyboardButton, WebAppInfo
from bot.api_client.orders import api_update_order_status
from bot.config import MINI_APP_URL

router = Router()


def _mini_app_kb():
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="🛍 Каталог", web_app=WebAppInfo(url=MINI_APP_URL))],
            [KeyboardButton(text="📦 Мои заказы", web_app=WebAppInfo(url=f"{MINI_APP_URL.rstrip('/')}/orders"))],
        ],
        resize_keyboard=True,
    )


# --- Редирект в Mini App (для старых кнопок или глубоких ссылок) ---
@router.message(F.text.in_({"🌸 Открыть магазин", "🛒 Корзина"}))
async def redirect_to_catalog(message: types.Message):
    await message.answer(
        "Каталог и корзина — в приложении. Нажмите кнопку ниже.",
        reply_markup=_mini_app_kb(),
    )


@router.message(F.text == "📦 Мои заказы")
async def redirect_to_orders(message: types.Message):
    await message.answer(
        "Заказы отображаются в приложении. Нажмите кнопку ниже.",
        reply_markup=_mini_app_kb(),
    )


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
