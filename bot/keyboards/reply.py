from aiogram.types import ReplyKeyboardMarkup, KeyboardButton

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
