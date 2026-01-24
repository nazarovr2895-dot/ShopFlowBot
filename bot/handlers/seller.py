from aiogram import Router, F, types, Bot
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.utils.deep_linking import create_start_link
import bot.keyboards.reply as kb

# ❗ ИМПОРТЫ API
from bot.api_client.sellers import api_check_limit, api_get_seller, api_create_product, api_get_my_products, api_delete_product

router = Router()

class AddProduct(StatesGroup):
    name = State(); description = State(); price = State(); photo = State()

# --- 1. ВХОД ---
@router.message(F.text == "📦 Режим продавца")
async def enter_seller_mode(message: types.Message, state: FSMContext):
    await state.clear()
    # Проверяем продавца через API
    seller = await api_get_seller(message.from_user.id)
    if not seller:
        return await message.answer("❌ Профиль продавца не найден или заблокирован.")
    
    await message.answer("🏪 Панель управления магазином.", reply_markup=kb.seller_main)

# --- 2. МОЯ ССЫЛКА ---
@router.message(F.text == "🔗 Моя ссылка")
async def get_seller_link(message: types.Message, bot: Bot):
    link = await create_start_link(bot, f"seller_{message.from_user.id}", encode=True)
    await message.answer(f"🔗 Ваша ссылка для клиентов:\n\n{link}")

# --- 3. МОИ ТОВАРЫ ---
@router.message(F.text == "📦 Мои товары")
async def my_products_list(message: types.Message):
    # Получаем список через API
    products = await api_get_my_products(message.from_user.id)
    
    if not products:
        return await message.answer("📭 У вас пока нет товаров.")
    
    for p in products:
        d_kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🗑 Удалить", callback_data=f"delete_{p.id}")]
        ])
        await message.answer_photo(
            photo=p.photo_id,
            caption=f"🌸 *{p.name}*\n💰 {p.price} ₽\n\n{p.description}",
            reply_markup=d_kb,
            parse_mode="Markdown"
        )

@router.callback_query(F.data.startswith("delete_"))
async def delete_product_handler(callback: types.CallbackQuery):
    p_id = int(callback.data.split("_")[1])
    # Удаляем через API
    success = await api_delete_product(p_id)
    if success:
        await callback.message.delete()
        await callback.answer("✅ Товар удален")
    else:
        await callback.answer("Ошибка удаления", show_alert=True)

# --- 4. ДОБАВЛЕНИЕ ТОВАРА (С ПРОВЕРКОЙ ЛИМИТОВ) ---
@router.message(F.text == "➕ Добавить товар")
async def start_add_p(message: types.Message, state: FSMContext):
    user_id = message.from_user.id
    
    # ❗ ВАЖНО: Проверяем лимит перед началом
    can_add = await api_check_limit(user_id)
    if not can_add:
        return await message.answer("⛔ Ваш лимит заказов или товаров исчерпан! Обработайте текущие заказы.")

    await state.set_state(AddProduct.name)
    await message.answer("Введите название товара:")

@router.message(AddProduct.name)
async def add_p_name(message: types.Message, state: FSMContext):
    await state.update_data(name=message.text)
    await state.set_state(AddProduct.description)
    await message.answer("Введите описание:")

@router.message(AddProduct.description)
async def add_p_desc(message: types.Message, state: FSMContext):
    await state.update_data(description=message.text)
    await state.set_state(AddProduct.price)
    await message.answer("Укажите цену (цифрами):")

@router.message(AddProduct.price)
async def add_p_price(message: types.Message, state: FSMContext):
    if not message.text.isdigit(): return await message.answer("Только цифры!")
    await state.update_data(price=message.text)
    await state.set_state(AddProduct.photo)
    await message.answer("Пришлите фото товара:")

@router.message(AddProduct.photo, F.photo)
async def add_p_photo(message: types.Message, state: FSMContext):
    photo_id = message.photo[-1].file_id
    data = await state.get_data()
    
    # Отправляем данные в API для создания
    await api_create_product(
        seller_id=message.from_user.id,
        name=data['name'],
        price=float(data['price']),
        description=data['description'],
        photo_id=photo_id
    )
    
    await message.answer(f"✅ Товар {data['name']} успешно добавлен!", reply_markup=kb.seller_main)
    await state.clear()