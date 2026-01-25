from aiogram import Router, F, types, Bot
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
import bot.keyboards.reply as kb

# Импорт API
from bot.api_client.sellers import api_check_limit, api_get_seller, api_create_product, api_get_my_products, api_delete_product

router = Router()
MASTER_ADMIN_ID = 8073613186

class AddProduct(StatesGroup):
    name = State(); description = State(); price = State(); photo = State()

class SellerSettings(StatesGroup):
    waiting_for_limit = State()

# --- 1. ВХОД В РЕЖИМ (Единственный правильный) ---
@router.message(F.text.in_({"📦 Режим продавца", "🔁 Режим продавца"}))
async def enter_seller_mode(message: types.Message, state: FSMContext):
    await state.clear()
    user_id = message.from_user.id
    
    # Master Key
    if user_id == MASTER_ADMIN_ID: 
        menu = kb.get_main_kb(user_id, "SELLER")
        await message.answer("🏪 Панель продавца (Master Access).", reply_markup=menu)
        return

    # Проверка базы
    seller = await api_get_seller(user_id)
    if not seller:
        # Возвращаем в меню покупателя
        menu = kb.get_main_kb(user_id, "BUYER")
        return await message.answer(
            "❌ Вы не являетесь продавцом.\nОбратитесь к администратору для регистрации.",
            reply_markup=menu
        )
    
    menu = kb.get_main_kb(user_id, "SELLER")
    await message.answer("🏪 Панель управления магазином.", reply_markup=menu)

# --- 2. ССЫЛКА ---
@router.message(F.text == "🔗 Ссылка на магазин") 
async def get_seller_link(message: types.Message, bot: Bot):
    bot_info = await bot.get_me()
    link = f"https://t.me/{bot_info.username}?start=seller_{message.from_user.id}"
    
    await message.answer(
        f"🔗 **Ваша ссылка для клиентов:**\n\n`{link}`\n\n"
        "Клиенты, перешедшие по ней, сразу попадут в каталог вашего магазина.", 
        parse_mode="Markdown"
    )

# --- 3. ТОВАРЫ ---
@router.message(F.text == "📦 Мои товары")
async def my_products_list(message: types.Message):
    products = await api_get_my_products(message.from_user.id)
    if not products:
        return await message.answer("📭 Товаров нет.")
    
    await message.answer(f"📦 Найдено товаров: {len(products)}")
    for p in products:
        d_kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="🗑 Удалить", callback_data=f"delete_{p.id}")]])
        caption = f"🏷 *{p.name}*\n📝 {p.description}\n💰 *{p.price} руб.*"
        if p.photo_id:
            await message.answer_photo(p.photo_id, caption=caption, reply_markup=d_kb, parse_mode="Markdown")
        else:
            await message.answer(caption, reply_markup=d_kb, parse_mode="Markdown")

@router.callback_query(F.data.startswith("delete_"))
async def delete_product_handler(callback: types.CallbackQuery):
    await api_delete_product(int(callback.data.split("_")[1]))
    await callback.message.delete()
    await callback.answer("✅ Товар удален")

# --- 4. ДОБАВЛЕНИЕ ---
@router.message(F.text == "➕ Добавить товар")
async def start_add_p(message: types.Message, state: FSMContext):
    if not await api_check_limit(message.from_user.id):
        return await message.answer("⛔ Лимит исчерпан!")
    await state.set_state(AddProduct.name)
    await message.answer("Введите название товара:", reply_markup=kb.cancel_kb)

@router.message(AddProduct.name)
async def add_p_name(message: types.Message, state: FSMContext):
    if message.text == "❌ Отмена":
        await state.clear()
        menu = kb.get_main_kb(message.from_user.id, "SELLER")
        await message.answer("Отменено.", reply_markup=menu)
        return
    await state.update_data(name=message.text)
    await state.set_state(AddProduct.description)
    await message.answer("Описание:", reply_markup=kb.cancel_kb)

@router.message(AddProduct.description)
async def add_p_desc(message: types.Message, state: FSMContext):
    await state.update_data(description=message.text)
    await state.set_state(AddProduct.price)
    await message.answer("Цена (число):", reply_markup=kb.cancel_kb)

@router.message(AddProduct.price)
async def add_p_price(message: types.Message, state: FSMContext):
    if not message.text.isdigit(): return await message.answer("Только цифры!")
    await state.update_data(price=float(message.text))
    await state.set_state(AddProduct.photo)
    await message.answer("Фото:", reply_markup=kb.cancel_kb)

@router.message(AddProduct.photo, F.photo)
async def add_p_photo(message: types.Message, state: FSMContext):
    photo_id = message.photo[-1].file_id
    data = await state.get_data()
    await message.answer("⏳ Сохраняю...")
    
    res = await api_create_product(message.from_user.id, data['name'], data['price'], data['description'], photo_id)
    menu = kb.get_main_kb(message.from_user.id, "SELLER")
    
    if res: await message.answer(f"✅ Товар '{data['name']}' добавлен!", reply_markup=menu)
    else: await message.answer("❌ Ошибка сохранения.", reply_markup=menu)
    await state.clear()

# --- 5. ВЫХОД (Переходы по кнопкам) ---
@router.message(F.text == "👑 Вернуться в АДМИН-ПАНЕЛЬ")
async def to_adm(message: types.Message):
    menu = kb.get_main_kb(message.from_user.id, "ADMIN")
    await message.answer("Меню админа.", reply_markup=menu)

@router.message(F.text == "🛍 Режим покупателя")
async def to_buy(message: types.Message):
    menu = kb.get_main_kb(message.from_user.id, "BUYER")
    await message.answer("Меню покупателя.", reply_markup=menu)