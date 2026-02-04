from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, WebAppInfo
from aiogram.utils.keyboard import ReplyKeyboardBuilder
from bot.config import MINI_APP_URL, MASTER_ADMIN_ID

def get_main_kb(user_id: int, role: str):
    """
    Генерирует клавиатуру динамически.
    Master Admin может переключаться в режим продавца (для тестирования).
    """
    builder = ReplyKeyboardBuilder()

    # --- 1. КНОПКИ ПРОДАВЦА ---
    if role == 'SELLER':
        builder.row(KeyboardButton(text="➕ Добавить товар"), KeyboardButton(text="📦 Мои товары"))
        builder.row(KeyboardButton(text="📩 Запросы на покупку"), KeyboardButton(text="⚡️ Активные заказы"))
        builder.row(KeyboardButton(text="⚙️ Настройка лимитов"), KeyboardButton(text="🔗 Ссылка на магазин"))
        builder.row(KeyboardButton(text="🛍 Режим покупателя"))

    # --- 2. КНОПКИ АГЕНТА ---
    elif role == 'AGENT':
        builder.row(KeyboardButton(text="🔗 Реферальная ссылка"), KeyboardButton(text="💰 Мой баланс"))
        builder.row(KeyboardButton(text="🛍 Режим покупателя"))

    # --- 3. КНОПКИ ПОКУПАТЕЛЯ (Mini App: каталог, заказы; в ТГ — только уведомления и подтверждение) ---
    else:  # BUYER
        builder.row(KeyboardButton(text="🛍 Каталог", web_app=WebAppInfo(url=MINI_APP_URL)))
        builder.row(KeyboardButton(text="📦 Мои заказы", web_app=WebAppInfo(url=f"{MINI_APP_URL.rstrip('/')}/orders")))
        builder.row(KeyboardButton(text="🔁 Режим продавца"), KeyboardButton(text="🤝 Режим посредника"))

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