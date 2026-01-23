from aiogram import Router, F, types, Bot
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.utils.deep_linking import create_start_link
import bot.keyboards.reply as kb

# Импортируем функции базы данных
from bot.database.requests import (
    create_product, 
    get_products_by_seller, 
    delete_product_by_id, 
    update_shop_info, 
    get_shop_info,
    get_seller_orders,      # ДОБАВИТЬ ЭТО
    update_order_status
)

router = Router()

# --- СОСТОЯНИЯ (STATES) ---

class AddProduct(StatesGroup):
    name = State()
    description = State()
    price = State()
    photo = State()

class ShopSetup(StatesGroup):
    name = State()
    delivery = State()
    metro = State()
    address = State()

# --- ДОБАВЛЕНИЕ ТОВАРА ---

@router.message(F.text == "➕ Добавить товар")
async def add_product_start(message: types.Message, state: FSMContext):
    await state.set_state(AddProduct.name)
    await message.answer("Шаг 1/4: Введите название товара")

@router.message(AddProduct.name)
async def add_product_name(message: types.Message, state: FSMContext):
    await state.update_data(name=message.text)
    await state.set_state(AddProduct.description)
    await message.answer("Шаг 2/4: Введите описание")

@router.message(AddProduct.description)
async def add_product_desc(message: types.Message, state: FSMContext):
    await state.update_data(description=message.text)
    await state.set_state(AddProduct.price)
    await message.answer("Шаг 3/4: Укажите цену (цифрами)")

@router.message(AddProduct.price)
async def add_product_price(message: types.Message, state: FSMContext):
    if not message.text.isdigit():
        return await message.answer("Пожалуйста, введите цену только цифрами.")
    await state.update_data(price=message.text)
    await state.set_state(AddProduct.photo)
    await message.answer("Шаг 4/4: Пришлите ОДНО фото товара")

@router.message(AddProduct.photo, F.photo)
async def add_product_photo(message: types.Message, state: FSMContext):
    photo_id = message.photo[-1].file_id
    data = await state.get_data()
    await create_product(
        seller_id=message.from_user.id,
        name=data['name'],
        description=data['description'],
        price=data['price'],
        photo_id=photo_id
    )
    await message.answer_photo(
        photo=photo_id, 
        caption=f"✅ Товар добавлен!\n\n🌸 {data['name']}\n💰 {data['price']} руб."
    )
    await state.clear()

# --- МОИ ТОВАРЫ ---

@router.message(F.text == "📦 Мои товары")
async def my_products(message: types.Message):
    products = await get_products_by_seller(message.from_user.id)
    if not products:
        return await message.answer("У вас пока нет товаров.")
    for product in products:
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="❌ Удалить", callback_data=f"delete_{product.id}")]
        ])
        await message.answer_photo(
            photo=product.photo_id,
            caption=f"🌸 *{product.name}*\n💰 {product.price} руб.",
            reply_markup=kb,
            parse_mode="Markdown"
        )

@router.callback_query(F.data.startswith("delete_"))
async def delete_product_callback(callback: types.CallbackQuery):
    product_id = int(callback.data.split("_")[1])
    await delete_product_by_id(product_id)
    await callback.answer("Товар удален")
    await callback.message.delete()

# --- НАСТРОЙКИ МАГАЗИНА ---

@router.message(F.text == "⚙️ Настройка магазина")
async def shop_settings(message: types.Message):
    shop = await get_shop_info(message.from_user.id)
    name = shop.name if shop and shop.name else 'Не задано'
    metro = shop.metro if shop and shop.metro else 'Не задано'
    delivery = shop.delivery_type if shop and shop.delivery_type else 'Не задано'
    
    text = (
        f"⚙️ *Настройки магазина:*\n\n"
        f"🏠 Название: {name}\n"
        f"📍 Метро: {metro}\n"
        f"🚚 Доставка: {delivery}"
    )
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📝 Название", callback_data="set_shop_name")],
        [InlineKeyboardButton(text="🚚 Доставка", callback_data="set_shop_delivery")],
        [InlineKeyboardButton(text="🚇 Метро", callback_data="set_shop_metro")],
        [InlineKeyboardButton(text="🏠 Адрес и Округ", callback_data="set_shop_address")]
    ])
    await message.answer(text, reply_markup=kb, parse_mode="Markdown")

@router.callback_query(F.data == "set_shop_name")
async def set_name_start(callback: types.CallbackQuery, state: FSMContext):
    await state.set_state(ShopSetup.name)
    await callback.message.answer("Введите название вашего магазина:")
    await callback.answer()

@router.message(ShopSetup.name)
async def set_name_finish(message: types.Message, state: FSMContext):
    await update_shop_info(message.from_user.id, name=message.text)
    await state.clear()
    await message.answer(f"✅ Название сохранено: {message.text}")

# Вспомогательные клавиатуры
def get_delivery_kb():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🚚 Только доставка", callback_data="delivery_only")],
        [InlineKeyboardButton(text="🏠 Только самовывоз", callback_data="delivery_pickup")],
        [InlineKeyboardButton(text="🔄 Оба варианта", callback_data="delivery_both")]
    ])

def get_districts_kb():
    districts = ["ЦАО", "САО", "СВАО", "ВАО", "ЮВАО", "ЮАО", "ЮЗАО", "ЗАО", "СЗАО", "Новомосковский", "Троицкий", "Зеленоград"]
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=d, callback_data=f"dist_{d}") for d in districts[i:i+3]]
        for i in range(0, len(districts), 3)
    ])

@router.callback_query(F.data == "set_shop_delivery")
async def set_delivery_start(callback: types.CallbackQuery):
    await callback.message.answer("Выберите способ доставки:", reply_markup=get_delivery_kb())
    await callback.answer()

@router.callback_query(F.data.startswith("delivery_"))
async def set_delivery_finish(callback: types.CallbackQuery):
    val_map = {"delivery_only": "Доставка", "delivery_pickup": "Самовывоз", "delivery_both": "Оба варианта"}
    val = val_map.get(callback.data)
    await update_shop_info(callback.from_user.id, delivery_type=val)
    await callback.message.edit_text(f"✅ Установлено: {val}")

@router.callback_query(F.data == "set_shop_address")
async def set_address_start(callback: types.CallbackQuery, state: FSMContext):
    await state.set_state(ShopSetup.address)
    await callback.message.answer("Введите точный адрес магазина:")
    await callback.answer()

@router.message(ShopSetup.address)
async def set_address_step2(message: types.Message, state: FSMContext):
    await state.update_data(temp_addr=message.text)
    await message.answer("Теперь выберите округ Москвы:", reply_markup=get_districts_kb())

@router.callback_query(F.data.startswith("dist_"))
async def set_district_finish(callback: types.CallbackQuery, state: FSMContext):
    district = callback.data.replace("dist_", "")
    data = await state.get_data()
    await update_shop_info(callback.from_user.id, address=data['temp_addr'], district=district)
    await state.clear()
    await callback.message.edit_text(f"✅ Адрес сохранен: {data['temp_addr']} ({district})")

@router.callback_query(F.data == "set_shop_metro")
async def set_metro_start(callback: types.CallbackQuery, state: FSMContext):
    await state.set_state(ShopSetup.metro)
    await callback.message.answer("Введите название метро:")
    await callback.answer()

@router.message(ShopSetup.metro)
async def set_metro_finish(message: types.Message, state: FSMContext):
    await update_shop_info(message.from_user.id, metro=message.text)
    await state.clear()
    await message.answer(f"✅ Метро установлено: {message.text}")

# --- ПЕРСОНАЛЬНАЯ ССЫЛКА ---

@router.message(F.text == "🔗 Моя ссылка")
async def get_my_link(message: types.Message, bot: Bot):
    # Генерация ссылки с параметром seller_ID
    link = await create_start_link(bot, f"seller_{message.from_user.id}", encode=True)
    await message.answer(f"🔗 Ваша ссылка для клиентов:\n\n`{link}`", parse_mode="Markdown")

@router.message(F.text == "❌ Отмена")
@router.message(F.command == "cancel")
async def cancel_handler(message: types.Message, state: FSMContext):
    await state.clear()
    await message.answer("Действие отменено. Состояние сброшено.", 
                         reply_markup=kb.seller_main) # Используйте клавиатуру из своего kb
    
@router.message(F.text == "📥 Заказы")
async def view_orders(message: types.Message):
    orders = await get_seller_orders(message.from_user.id)
    if not orders:
        return await message.answer("У вас пока нет новых заказов. 🤗")

    for order in orders:
        # Сделали префикс 'status' уникальным
        order_kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="✅ Принять", callback_data=f"status_accept_{order.id}")],
            [InlineKeyboardButton(text="❌ Отклонить", callback_data=f"status_reject_{order.id}")]
        ])
        
        await message.answer(
            f"📦 *Заказ №{order.id}*\n\n{order.items_info}",
            reply_markup=order_kb,
            parse_mode="Markdown"
        )

# ИСПРАВЛЕННЫЙ ХЕНДЛЕР СТАТУСА
@router.callback_query(F.data.startswith("status_"))
async def handle_order_status(callback: types.CallbackQuery):
    # Теперь мы правильно разделяем на 3 части: status, действие, ID
    _, action, order_id = callback.data.split("_")
    
    new_status = "ACCEPTED" if action == "accept" else "REJECTED"
    await update_order_status(int(order_id), new_status)
    
    res_text = "✅ Заказ принят!" if action == "accept" else "❌ Заказ отклонен."
    await callback.message.edit_text(f"{callback.message.text}\n\n⚠️ *Статус: {res_text}*", parse_mode="Markdown")
    await callback.answer()