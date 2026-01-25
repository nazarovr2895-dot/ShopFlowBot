from aiogram.types import ReplyKeyboardMarkup, KeyboardButton
from aiogram.utils.keyboard import ReplyKeyboardBuilder

# 👇 ТВОЙ ID (ЗОЛОТОЙ КЛЮЧ)
MASTER_ADMIN_ID = 8073613186

def get_main_kb(user_id: int, role: str):
    """
    Генерирует клавиатуру динамически.
    Показывает кнопку Админа ТОЛЬКО если user_id == MASTER_ADMIN_ID.
    """
    builder = ReplyKeyboardBuilder()

    # --- 1. КНОПКИ ДЛЯ РЕЖИМА АДМИНА ---
    if role == 'ADMIN':
        builder.row(KeyboardButton(text="➕ Добавить продавца"), KeyboardButton(text="📝 Изменить данные"))
        builder.row(KeyboardButton(text="⚙️ Управление продавцами"), KeyboardButton(text="📊 Статистика"))
        builder.row(KeyboardButton(text="👥 Управление посредниками"))
        builder.row(KeyboardButton(text="🛍 Режим покупателя"), KeyboardButton(text="📦 Режим продавца"))
        builder.row(KeyboardButton(text="🤝 Режим посредника"))
    
    # --- 2. КНОПКИ ПРОДАВЦА ---
    elif role == 'SELLER':
        builder.row(KeyboardButton(text="➕ Добавить товар"), KeyboardButton(text="📦 Мои товары"))
        builder.row(KeyboardButton(text="📩 Запросы на покупку"), KeyboardButton(text="⚡️ Активные заказы"))
        builder.row(KeyboardButton(text="⚙️ Настройка лимитов"), KeyboardButton(text="🔗 Ссылка на магазин"))
        builder.row(KeyboardButton(text="🛍 Режим покупателя"))
        
        # Кнопка админа только для ТЕБЯ
        if user_id == MASTER_ADMIN_ID:
            builder.add(KeyboardButton(text="👑 Вернуться в АДМИН-ПАНЕЛЬ"))

    # --- 3. КНОПКИ АГЕНТА ---
    elif role == 'AGENT':
        builder.row(KeyboardButton(text="🔗 Реферальная ссылка"), KeyboardButton(text="💰 Мой баланс"))
        builder.row(KeyboardButton(text="🛍 Режим покупателя"))
        
        if user_id == MASTER_ADMIN_ID:
            builder.add(KeyboardButton(text="👑 Вернуться в АДМИН-ПАНЕЛЬ"))

    # --- 4. КНОПКИ ПОКУПАТЕЛЯ (Для всех остальных) ---
    else: # BUYER
        builder.row(KeyboardButton(text="🌸 Открыть магазин"), KeyboardButton(text="🛒 Корзина"))
        builder.row(KeyboardButton(text="📦 Режим продавца"), KeyboardButton(text="🤝 Режим посредника"))
        
        if user_id == MASTER_ADMIN_ID:
            builder.row(KeyboardButton(text="👑 Вернуться в АДМИН-ПАНЕЛЬ"))

    return builder.as_markup(resize_keyboard=True)

# --- ВСПОМОГАТЕЛЬНЫЕ КЛАВИАТУРЫ (Оставляем статикой) ---
cancel_kb = ReplyKeyboardMarkup(keyboard=[
    [KeyboardButton(text="❌ Отмена")]
], resize_keyboard=True, one_time_keyboard=True)

yes_no_kb = ReplyKeyboardMarkup(keyboard=[
    [KeyboardButton(text="Да, я самозанятый"), KeyboardButton(text="Нет, физлицо")],
    [KeyboardButton(text="❌ Отмена")]
], resize_keyboard=True, one_time_keyboard=True)