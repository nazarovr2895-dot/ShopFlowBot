from aiogram import Router, F, types
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from bot.database.requests import (
    add_new_seller_db, get_user_role, get_cities, 
    get_districts_by_city, get_seller_by_fio,
    update_seller_block_status, delete_seller_db, get_shop_info,
    get_platform_stats, update_commission
)
import bot.keyboards.reply as kb
from datetime import datetime

router = Router()

class AddSeller(StatesGroup):
    fio = State(); tg_id = State(); phone = State(); shop_name = State()
    info = State(); city = State(); district = State(); map_url = State()
    delivery = State(); expiry = State()

class ManageSeller(StatesGroup):
    search_fio = State()

class AdminSettings(StatesGroup):
    new_commission = State()

# --- 1. ДОБАВЛЕНИЕ ПРОДАВЦА ---
@router.message(F.text == "➕ Добавить продавца")
async def start_add_seller(message: types.Message, state: FSMContext):
    if await get_user_role(message.from_user.id) != 'ADMIN': return 
    await state.set_state(AddSeller.fio); await message.answer("Шаг 1/10: Введите ФИО владельца:")

@router.message(AddSeller.fio)
async def add_fio(message: types.Message, state: FSMContext):
    await state.update_data(fio=message.text); await state.set_state(AddSeller.tg_id)
    await message.answer("Шаг 2/10: Введите Telegram ID продавца:")

@router.message(AddSeller.tg_id)
async def add_tg_id(message: types.Message, state: FSMContext):
    if not message.text.isdigit(): return await message.answer("Только цифры!")
    await state.update_data(tg_id=int(message.text)); await state.set_state(AddSeller.phone)
    await message.answer("Шаг 3/10: Номер телефона:")

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
    cities = await get_cities()
    buttons = [[InlineKeyboardButton(text=c.name, callback_data=f"admin_city_{c.id}")] for c in cities]
    await state.set_state(AddSeller.city)
    await message.answer("Шаг 6/10: Выберите город:", reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons))

@router.callback_query(AddSeller.city, F.data.startswith("admin_city_"))
async def select_city(callback: types.CallbackQuery, state: FSMContext):
    cid = int(callback.data.split("_")[2]); await state.update_data(city_id=cid)
    dists = await get_districts_by_city(cid)
    buttons = [[InlineKeyboardButton(text=d.name, callback_data=f"admin_dist_{d.id}")] for d in dists]
    await state.set_state(AddSeller.district)
    await callback.message.edit_text("Шаг 7/10: Выберите округ:", reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons))
    await callback.answer()

@router.callback_query(AddSeller.district, F.data.startswith("admin_dist_"))
async def select_dist(callback: types.CallbackQuery, state: FSMContext):
    await state.update_data(district_id=int(callback.data.split("_")[2])); await state.set_state(AddSeller.map_url)
    await callback.message.answer("Шаг 8/10: Ссылка на Яндекс.Карты:"); await callback.answer()

@router.message(AddSeller.map_url)
async def add_map_url(message: types.Message, state: FSMContext):
    await state.update_data(map_url=message.text); await state.set_state(AddSeller.delivery)
    kb_del = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🚚 Доставка", callback_data="set_deliv_delivery")],
        [InlineKeyboardButton(text="🏠 Самовывоз", callback_data="set_deliv_pickup")],
        [InlineKeyboardButton(text="🔄 Оба", callback_data="set_deliv_both")]])
    await message.answer("Шаг 9/10: Способ получения:", reply_markup=kb_del)

@router.callback_query(AddSeller.delivery, F.data.startswith("set_deliv_"))
async def add_delivery(callback: types.CallbackQuery, state: FSMContext):
    await state.update_data(delivery=callback.data.split("_")[2]); await state.set_state(AddSeller.expiry)
    await callback.message.answer("Шаг 10/10: Срок размещения (ГГГГ-ММ-ДД):"); await callback.answer()

@router.message(AddSeller.expiry)
async def finish_add_seller(message: types.Message, state: FSMContext):
    try:
        expiry = datetime.strptime(message.text, '%Y-%m-%d'); d = await state.get_data()
        await add_new_seller_db(d['tg_id'], d['fio'], d['phone'], d['shop_name'], d['info'], d['city_id'], d['district_id'], d['map_url'], d['delivery'], expiry)
        await state.clear(); await message.answer(f"✅ Продавец {d['fio']} добавлен!", reply_markup=kb.admin_main)
    except: await message.answer("Ошибка даты! Формат: ГГГГ-ММ-ДД")

# --- 2. УПРАВЛЕНИЕ ---
@router.message(F.text == "⚙️ Управление продавцами")
async def manage_sellers(message: types.Message, state: FSMContext):
    await state.set_state(ManageSeller.search_fio); await message.answer("Введите ФИО для поиска:")

@router.message(ManageSeller.search_fio)
async def search_res(message: types.Message, state: FSMContext):
    sellers = await get_seller_by_fio(message.text)
    if not sellers: return await message.answer("Никого не нашли.")
    for u in sellers:
        shop = await get_shop_info(u.tg_id)
        status = "🚫 БЛОК" if shop.is_blocked else "✅ Активен"
        m_kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🔓 Разблок" if shop.is_blocked else "🔒 Блок", callback_data=f"adm_block_{u.tg_id}_{int(not shop.is_blocked)}")],
            [InlineKeyboardButton(text="🗑 Удалить", callback_data=f"adm_del_{u.tg_id}")]])
        await message.answer(f"👤 {u.fio}\nМагазин: {shop.shop_name}\nСтатус: {status}", reply_markup=m_kb)
    await state.clear()

@router.callback_query(F.data.startswith("adm_block_"))
async def do_block(callback: types.CallbackQuery):
    _, _, tid, stat = callback.data.split("_"); await update_seller_block_status(int(tid), bool(int(stat)))
    await callback.message.edit_text(callback.message.text + "\n\n⚠️ Статус обновлен."); await callback.answer()

@router.callback_query(F.data.startswith("adm_del_"))
async def do_del(callback: types.CallbackQuery):
    await delete_seller_db(int(callback.data.split("_")[2])); await callback.message.edit_text("🗑 Удален."); await callback.answer()

# --- 3. СТАТИСТИКА И ПЕРЕКЛЮЧЕНИЯ ---
@router.message(F.text == "📊 Статистика")
async def show_stats(message: types.Message):
    stats, comm = await get_platform_stats()
    text = f"📊 *ОТЧЕТ ПЛАТФОРМЫ*\nКомиссия: {comm}%\n\n"
    total = 0
    for s in stats:
        text += f"👤 {s['fio']}\n   Продажи: {s['sales']} ₽\n   Твои: {s['profit']} ₽\n\n"; total += s['profit']
    text += f"📈 *ИТОГО ТВОЙ ДОХОД: {total} ₽*"
    c_kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="⚙️ Изменить %", callback_data="admin_change_comm")]])
    await message.answer(text, reply_markup=c_kb, parse_mode="Markdown")

@router.callback_query(F.data == "admin_change_comm")
async def start_comm(callback: types.CallbackQuery, state: FSMContext):
    await state.set_state(AdminSettings.new_commission); await callback.message.answer("Введите новый %:"); await callback.answer()

@router.message(AdminSettings.new_commission)
async def finish_comm(message: types.Message, state: FSMContext):
    if message.text.isdigit():
        await update_commission(int(message.text)); await state.clear()
        await message.answer(f"✅ Комиссия: {message.text}%", reply_markup=kb.admin_main)

@router.message(F.text == "🛍 Режим покупателя")
async def set_buyer(message: types.Message): await message.answer("Режим покупателя.", reply_markup=kb.buyer_main)

@router.message(F.text == "📦 Режим продавца")
async def set_seller(message: types.Message): await message.answer("Режим продавца.", reply_markup=kb.seller_main)

@router.message(F.text == "🤝 Режим посредника")
async def set_agent(message: types.Message): await message.answer("Режим посредника.", reply_markup=kb.agent_main)

@router.message(F.text == "👑 Вернуться в АДМИН-ПАНЕЛЬ")
async def to_adm(message: types.Message): await message.answer("Меню админа.", reply_markup=kb.admin_main)