from aiogram import Router, F, types
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
import bot.keyboards.reply as kb
from bot.api_client.sellers import api_create_seller

router = Router()

class AddSeller(StatesGroup):
    tg_id = State()
    shop_name = State()
    delivery_type = State()

# --- 1. ДОБАВЛЕНИЕ ПРОДАВЦА ---
@router.message(F.text == "➕ Добавить продавца")
async def start_add_seller(message: types.Message, state: FSMContext):
    await state.set_state(AddSeller.tg_id)
    await message.answer("🆔 Введите Telegram ID продавца (цифрами):")

@router.message(AddSeller.tg_id)
async def add_tg_id(message: types.Message, state: FSMContext):
    if not message.text.isdigit():
        return await message.answer("❌ Введите только цифры!")
    
    await state.update_data(tg_id=int(message.text))
    await state.set_state(AddSeller.shop_name)
    await message.answer("🏪 Введите название магазина:")

@router.message(AddSeller.shop_name)
async def add_shop_name(message: types.Message, state: FSMContext):
    await state.update_data(shop_name=message.text)
    await state.set_state(AddSeller.delivery_type)
    
    # Кнопки для выбора доставки
    del_kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🚚 Доставка", callback_data="deliv_delivery")],
        [InlineKeyboardButton(text="🏠 Самовывоз", callback_data="deliv_pickup")]
    ])
    await message.answer("🚚 Выберите тип доставки:", reply_markup=del_kb)

@router.callback_query(AddSeller.delivery_type, F.data.startswith("deliv_"))
async def finish_add_seller(callback: types.CallbackQuery, state: FSMContext):
    delivery_type = callback.data.split("_")[1]
    data = await state.get_data()
    
    # Вызываем API
    success = await api_create_seller(
        tg_id=data['tg_id'],
        fio="Unknown", # Пока не важно
        phone="000",   # Пока не важно
        shop_name=data['shop_name'],
        delivery_type=delivery_type
    )
    
    if success:
        await callback.message.edit_text(f"✅ Продавец {data['shop_name']} успешно добавлен!")
    else:
        await callback.message.edit_text("❌ Ошибка: возможно, продавец уже существует.")
    
    await state.clear()

# --- 2. ДРУГИЕ КНОПКИ (Заглушки, чтобы не молчали) ---

@router.message(F.text == "⚙️ Управление продавцами")
async def manage_sellers(message: types.Message):
    await message.answer("🔧 Управление продавцами скоро будет доступно (Список, Блокировка).")

@router.message(F.text == "📊 Статистика")
async def show_stats(message: types.Message):
    await message.answer("📊 Статистика платформы:\n\nПользователей: 1\nЗаказов: 0\nОборот: 0 руб.")

@router.message(F.text == "📝 Изменить данные")
async def edit_data(message: types.Message):
    await message.answer("📝 Функция редактирования в разработке.")

# --- ВЫХОД ---
@router.message(F.text == "👑 Вернуться в АДМИН-ПАНЕЛЬ")
async def back_to_admin_handler(message: types.Message):
    await message.answer("Вы в главном меню админа.", reply_markup=kb.admin_main)