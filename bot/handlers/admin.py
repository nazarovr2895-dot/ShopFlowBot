from aiogram import Router, F, types
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from datetime import datetime
import bot.keyboards.reply as kb

# ❗ API ИМПОРТЫ (Если каких-то нет, используй пока функции users/sellers)
from bot.api_client.buyers import api_get_user
from bot.api_client.sellers import api_create_seller, api_update_seller_status, api_get_seller

router = Router()

class AddSeller(StatesGroup):
    fio = State(); tg_id = State(); phone = State(); shop_name = State()
    info = State(); city = State(); district = State(); map_url = State()
    delivery = State(); expiry = State()

class ManageSeller(StatesGroup):
    search_fio = State()

@router.message(F.text == "➕ Добавить продавца")
async def start_add_seller(message: types.Message, state: FSMContext):
    await state.clear()
    user = await api_get_user(message.from_user.id)
    if not user or user.role != 'ADMIN': return 
    
    await state.set_state(AddSeller.fio)
    await message.answer("Шаг 1/10: Введите ФИО владельца:")

@router.message(AddSeller.fio)
async def add_fio(message: types.Message, state: FSMContext):
    await state.update_data(fio=message.text); await state.set_state(AddSeller.tg_id)
    await message.answer("Шаг 2/10: Введите Telegram ID:")

@router.message(AddSeller.tg_id)
async def add_tg_id(message: types.Message, state: FSMContext):
    if not message.text.isdigit(): return await message.answer("Только цифры!")
    await state.update_data(tg_id=int(message.text)); await state.set_state(AddSeller.phone)
    await message.answer("Шаг 3/10: Телефон:")

@router.message(AddSeller.phone)
async def add_phone(message: types.Message, state: FSMContext):
    await state.update_data(phone=message.text); await state.set_state(AddSeller.shop_name)
    await message.answer("Шаг 4/10: Название цветочной:")

@router.message(AddSeller.shop_name)
async def add_shop_name(message: types.Message, state: FSMContext):
    await state.update_data(shop_name=message.text); await state.set_state(AddSeller.info)
    await message.answer("Шаг 5/10: ИНН / ОГРН:")

@router.message(AddSeller.info)
async def add_info(message: types.Message, state: FSMContext):
    await state.update_data(info=message.text)
    # Города пока захардкодим или получим через API, если есть эндпоинт
    await state.set_state(AddSeller.city)
    await message.answer("Шаг 6/10: Введите ID города (пока упрощенно):")

@router.message(AddSeller.city)
async def select_city_manual(message: types.Message, state: FSMContext):
    await state.update_data(city_id=1) # Заглушка
    await state.set_state(AddSeller.district)
    await message.answer("Шаг 7/10: Введите ID района (пока упрощенно):")

@router.message(AddSeller.district)
async def select_dist_manual(message: types.Message, state: FSMContext):
    await state.update_data(district_id=1)
    await state.set_state(AddSeller.map_url)
    await message.answer("Шаг 8/10: Ссылка Яндекс.Карты:")

@router.message(AddSeller.map_url)
async def add_map(message: types.Message, state: FSMContext):
    await state.update_data(map_url=message.text); await state.set_state(AddSeller.delivery)
    kb_del = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="Доставка", callback_data="set_deliv_delivery")],[InlineKeyboardButton(text="Самовывоз", callback_data="set_deliv_pickup")]])
    await message.answer("Шаг 9/10: Доставка:", reply_markup=kb_del)

@router.callback_query(AddSeller.delivery, F.data.startswith("set_deliv_"))
async def add_deliv(callback: types.CallbackQuery, state: FSMContext):
    await state.update_data(delivery=callback.data.split("_")[2]); await state.set_state(AddSeller.expiry)
    await callback.message.answer("Шаг 10/10: Срок размещения (ГГГГ-ММ-ДД):"); await callback.answer()

@router.message(AddSeller.expiry)
async def finish_add(message: types.Message, state: FSMContext):
    try:
        d = await state.get_data()
        # Создаем через API
        await api_create_seller(
            tg_id=d['tg_id'],
            fio=d['fio'],
            phone=d['phone'],
            shop_name=d['shop_name'],
            delivery_type=d['delivery']
            # Остальные поля можно добавить в аргументы функции
        )
        await state.clear()
        await message.answer(f"✅ Продавец добавлен!", reply_markup=kb.admin_main)
    except Exception as e: 
        await message.answer(f"Ошибка: {e}")

@router.message(F.text == "📦 Режим продавца")
async def to_seller(message: types.Message):
    await message.answer("Вход в режим продавца...", reply_markup=kb.seller_main)

@router.message(F.text == "👑 Вернуться в АДМИН-ПАНЕЛЬ")
async def to_adm(message: types.Message):
    await message.answer("Меню админа.", reply_markup=kb.admin_main)