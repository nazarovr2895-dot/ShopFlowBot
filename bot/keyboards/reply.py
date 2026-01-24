from aiogram.types import ReplyKeyboardMarkup, KeyboardButton

# 1. АДМИН
admin_main = ReplyKeyboardMarkup(keyboard=[
    [KeyboardButton(text="➕ Добавить продавца"), KeyboardButton(text="📝 Изменить данные")],
    [KeyboardButton(text="⚙️ Управление продавцами"), KeyboardButton(text="📊 Статистика")],
    [KeyboardButton(text="👥 Управление посредниками")],
    [KeyboardButton(text="🛍 Режим покупателя"), KeyboardButton(text="📦 Режим продавца")],
    [KeyboardButton(text="🤝 Режим посредника"), KeyboardButton(text="🏠 Главное меню")]
], resize_keyboard=True)

# 2. ПРОДАВЕЦ
seller_main = ReplyKeyboardMarkup(keyboard=[
    [KeyboardButton(text="➕ Добавить товар"), KeyboardButton(text="📦 Мои товары")],
    [KeyboardButton(text="📩 Запросы на покупку"), KeyboardButton(text="⚡️ Активные заказы")],
    [KeyboardButton(text="⚙️ Настройка лимитов"), KeyboardButton(text="🔗 Моя ссылка")],
    [KeyboardButton(text="🛍 Режим покупателя"), KeyboardButton(text="👑 Вернуться в АДМИН-ПАНЕЛЬ")]
], resize_keyboard=True)

# 3. ПОКУПАТЕЛЬ
buyer_main = ReplyKeyboardMarkup(keyboard=[
    [KeyboardButton(text="🌸 Открыть магазин"), KeyboardButton(text="🛒 Корзина")],
    [KeyboardButton(text="📦 Режим продавца"), KeyboardButton(text="🤝 Режим посредника")],
    [KeyboardButton(text="👑 Вернуться в АДМИН-ПАНЕЛЬ")] # Добавили кнопку сюда
], resize_keyboard=True)