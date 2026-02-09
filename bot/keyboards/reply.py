from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, WebAppInfo
from aiogram.utils.keyboard import ReplyKeyboardBuilder
from bot.config import MINI_APP_URL

def get_main_kb(user_id: int, role: str):
    """
    Генерирует клавиатуру динамически.
    """
    builder = ReplyKeyboardBuilder()

    # --- КНОПКИ ПОКУПАТЕЛЯ (Mini App: каталог, заказы; в ТГ — только уведомления и подтверждение) ---
    builder.row(KeyboardButton(text="🛍 Каталог", web_app=WebAppInfo(url=MINI_APP_URL)))
    builder.row(KeyboardButton(text="📦 Мои заказы", web_app=WebAppInfo(url=f"{MINI_APP_URL.rstrip('/')}/orders")))

    return builder.as_markup(resize_keyboard=True)

# --- ВСПОМОГАТЕЛЬНЫЕ КЛАВИАТУРЫ (Оставляем статикой) ---
cancel_kb = ReplyKeyboardMarkup(keyboard=[
    [KeyboardButton(text="❌ Отмена")]
], resize_keyboard=True, one_time_keyboard=True)

yes_no_kb = ReplyKeyboardMarkup(keyboard=[
    [KeyboardButton(text="Да, я самозанятый"), KeyboardButton(text="Нет, физлицо")],
    [KeyboardButton(text="❌ Отмена")]
], resize_keyboard=True, one_time_keyboard=True)

# До 3 фото: отправить фото, затем нажать «Готово»
photo_done_kb = ReplyKeyboardMarkup(keyboard=[
    [KeyboardButton(text="✅ Готово")],
    [KeyboardButton(text="❌ Отмена")]
], resize_keyboard=True, one_time_keyboard=True)