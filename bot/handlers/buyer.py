from aiogram import Router, F, types
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
import bot.keyboards.reply as kb
from bot.api_client.sellers import api_get_products, api_get_seller
from bot.api_client.orders import api_create_order

router = Router()

class Checkout(StatesGroup):
    phone = State()
    delivery_choice = State()
    address = State()

# --- 1. ОТКРЫТЬ МАГАЗИН ---
@router.message(F.text == "🌸 Открыть магазин")
async def open_shop(message: types.Message, state: FSMContext):
    data = await state.get_data()
    
    # 1. Пытаемся понять, в чьем мы магазине
    seller_id = data.get("current_seller_id")
    
    # Если мы не переходили по ссылке, показываем тестовый магазин (например, твой ID админа)
    if not seller_id:
        # ЗАМЕНИ НА СВОЙ ID, чтобы тестировать на себе
        seller_id = 8073613186
        await message.answer(f"⚠️ Вы не выбрали магазин по ссылке. Показываю витрину тестового магазина (ID: {seller_id})")

    # 2. Получаем товары через API
    products = await api_get_products(seller_id)
    
    if not products:
        return await message.answer("📭 В этом магазине пока нет товаров.")

    # 3. Показываем товары
    for product in products:
        # product - это объект, который мы сделали в api_client
        buy_kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="➕ В корзину", callback_data=f"buy_{product.id}_{product.name}_{product.price}")]
        ])
        
        # Если есть фото
        if hasattr(product, 'photo_id') and product.photo_id:
            await message.answer_photo(
                photo=product.photo_id,
                caption=f"🌸 *{product.name}*\n💰 {product.price} руб.\n\n{product.description}",
                reply_markup=buy_kb,
                parse_mode="Markdown"
            )
        else:
            await message.answer(
                f"🌸 *{product.name}*\n💰 {product.price} руб.\n\n{product.description}",
                reply_markup=buy_kb,
                parse_mode="Markdown"
            )

# --- 2. КОРЗИНА ---
@router.message(F.text == "🛒 Корзина")
async def show_cart(message: types.Message, state: FSMContext):
    data = await state.get_data()
    cart = data.get("cart", {})
    
    if not cart:
        return await message.answer("Ваша корзина пуста 🛒")

    total_price = 0
    text = "📦 *Ваши товары в корзине:*\n\n"

    for p_id, item in cart.items():
        item_total = item['price'] * item['count']
        total_price += item_total
        text += f"🌸 {item['name']} x {item['count']} шт. = {item_total} руб.\n"
    
    text += f"\nИТОГО: *{total_price} руб.*"

    summary_kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ Оформить заказ", callback_data="checkout")],
        [InlineKeyboardButton(text="🗑 Очистить всё", callback_data="clear_cart")]
    ])
    await message.answer(text, reply_markup=summary_kb, parse_mode="Markdown")

@router.callback_query(F.data == "clear_cart")
async def clear_cart(callback: types.CallbackQuery, state: FSMContext):
    await state.update_data(cart={})
    await callback.answer("Корзина очищена")
    await callback.message.delete()

# --- 3. ДОБАВЛЕНИЕ В КОРЗИНУ ---
@router.callback_query(F.data.startswith("buy_"))
async def add_to_cart(callback: types.CallbackQuery, state: FSMContext):
    # data format: buy_ID_NAME_PRICE
    parts = callback.data.split("_")
    p_id = parts[1]
    p_name = parts[2]
    p_price = float(parts[3])

    data = await state.get_data()
    cart = dict(data.get("cart", {}))
    
    if p_id in cart:
        cart[p_id]['count'] += 1
    else:
        cart[p_id] = {'name': p_name, 'price': p_price, 'count': 1}
    
    await state.update_data(cart=cart)
    await callback.answer(f"✅ {p_name} добавлен в корзину!")

# --- 4. ОФОРМЛЕНИЕ ЗАКАЗА ---
@router.callback_query(F.data == "checkout")
async def checkout_start(callback: types.CallbackQuery, state: FSMContext):
    await state.set_state(Checkout.phone)
    await callback.message.answer("Введите ваш номер телефона:")
    await callback.answer()

@router.message(Checkout.phone)
async def checkout_phone(message: types.Message, state: FSMContext):
    await state.update_data(phone=message.text)
    await state.set_state(Checkout.delivery_choice)
    choice_kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🚚 Доставка", callback_data="target_delivery")],
        [InlineKeyboardButton(text="🏠 Самовывоз", callback_data="target_pickup")]
    ])
    await message.answer("Выберите способ получения:", reply_markup=choice_kb)

@router.callback_query(F.data.in_({"target_delivery", "target_pickup"}))
async def process_delivery_choice(callback: types.CallbackQuery, state: FSMContext):
    type_name = "Доставка" if callback.data == "target_delivery" else "Самовывоз"
    await state.update_data(delivery_type=type_name)
    await state.set_state(Checkout.address)
    await callback.message.answer(f"Введите адрес ({type_name}):")
    await callback.answer()

@router.message(Checkout.address)
async def checkout_finish(message: types.Message, state: FSMContext):
    data = await state.get_data()
    cart = data.get("cart", {})
    
    # Пытаемся взять ID продавца из перехода по ссылке
    # Если его нет — берем ТВОЙ ID (как дефолтный магазин)
    seller_id = data.get("current_seller_id", 8073613186) 
    
    items_info = ", ".join([f"{v['name']} x {v['count']}" for v in cart.values()])
    total = sum([v['price'] * v['count'] for v in cart.values()])

    order_payload = {
        "buyer_id": message.from_user.id,
        "seller_id": seller_id,
        "items_info": items_info,
        "total_price": total,
        "delivery_type": data['delivery_type'],
        "address": message.text,
        "agent_id": data.get("current_agent_id")
    }

    # Отправляем запрос
    res = await api_create_order(order_payload)
    
    # --- ИСПРАВЛЕНИЕ: ПРОВЕРКА РЕЗУЛЬТАТА ---
    if res:
        await message.answer(f"🎉 Заказ №{res.id} оформлен! Ожидайте подтверждения от продавца.")
        await state.clear() # Очищаем корзину и состояние только при успехе
    else:
        await message.answer(
            "❌ **Ошибка оформления заказа!**\n\n"
            "Возможные причины:\n"
            "1. Продавец перестал существовать (база была очищена).\n"
            "2. Магазин временно закрыт.\n"
            "3. Лимит заказов продавца превышен.\n\n"
            "Попробуйте связаться с администратором.",
            parse_mode="Markdown"
        )
