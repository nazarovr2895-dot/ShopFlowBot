from aiogram.types import ReplyKeyboardMarkup, KeyboardButton

def get_buyer_main(is_admin=False):
    buttons = [
        [KeyboardButton(text="🛍 Открыть магазин")],
        [KeyboardButton(text="🛒 Корзина"), KeyboardButton(text="🧾 Мои заказы")],
        [KeyboardButton(text="🔁 Режим продавца"), KeyboardButton(text="🔁 Режим посредника")]
    ]
    if is_admin:
        buttons.append([KeyboardButton(text="👑 Вернуться в АДМИН-ПАНЕЛЬ")])
    return ReplyKeyboardMarkup(keyboard=buttons, resize_keyboard=True)

def get_seller_main(is_admin=False):
    buttons = [
        [KeyboardButton(text="➕ Добавить товар"), KeyboardButton(text="📦 Мои товары")],
        [KeyboardButton(text="📥 Заказы"), KeyboardButton(text="⚙️ Настройка магазина")],
        [KeyboardButton(text="🔗 Моя ссылка"), KeyboardButton(text="👁 Посмотреть магазин")],
        [KeyboardButton(text="🔁 Режим покупателя"), KeyboardButton(text="🔁 Режим посредника")]
    ]
    if is_admin:
        buttons.append([KeyboardButton(text="👑 Вернуться в АДМИН-ПАНЕЛЬ")])
    return ReplyKeyboardMarkup(keyboard=buttons, resize_keyboard=True)

def get_agent_main(is_admin=False):
    buttons = [
        [KeyboardButton(text="🔗 Моя ссылка для покупателя")],
        [KeyboardButton(text="💰 Мой баланс"), KeyboardButton(text="👥 Пригласить посредника")],
        [KeyboardButton(text="🔁 Режим покупателя"), KeyboardButton(text="🔁 Режим продавца")]
    ]
    if is_admin:
        buttons.append([KeyboardButton(text="👑 Вернуться в АДМИН-ПАНЕЛЬ")])
    return ReplyKeyboardMarkup(keyboard=buttons, resize_keyboard=True)

# Главная панель админа со всеми входами
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton

# ГЛАВНОЕ МЕНЮ АДМИНА
admin_main = ReplyKeyboardMarkup(keyboard=[
    [KeyboardButton(text="➕ Добавить продавца"), KeyboardButton(text="📝 Изменить данные")],
    [KeyboardButton(text="⚙️ Управление продавцами"), KeyboardButton(text="📊 Статистика")],
    [KeyboardButton(text="👥 Управление посредниками")],
    [KeyboardButton(text="🛍 Режим покупателя"), KeyboardButton(text="📦 Режим продавца")],
    [KeyboardButton(text="🤝 Режим посредника"), KeyboardButton(text="🏠 Главное меню")]
], resize_keyboard=True)

# Заглушки для других режимов (понадобятся для переходов)
buyer_main = ReplyKeyboardMarkup(keyboard=[
    [KeyboardButton(text="🌸 Открыть магазин"), KeyboardButton(text="🛒 Корзина")],
    [KeyboardButton(text="👑 Вернуться в АДМИН-ПАНЕЛЬ")]
], resize_keyboard=True)

seller_main = ReplyKeyboardMarkup(keyboard=[
    [KeyboardButton(text="📦 Мои товары"), KeyboardButton(text="📥 Заказы")],
    [KeyboardButton(text="👑 Вернуться в АДМИН-ПАНЕЛЬ")]
], resize_keyboard=True)

agent_main = ReplyKeyboardMarkup(keyboard=[
    [KeyboardButton(text="🔗 Моя ссылка"), KeyboardButton(text="💰 Мой баланс")],
    [KeyboardButton(text="👑 Вернуться в АДМИН-ПАНЕЛЬ")]
], resize_keyboard=True)