from aiogram import Router, F, types
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
import bot.keyboards.reply as kb

# ❗ ИМПОРТЫ API
from bot.api_client.orders import api_create_order
from bot.api_client.sellers import api_get_products, api_get_seller

router = Router()

class Checkout(StatesGroup):
    phone = State()
    delivery_choice = State()
    address = State()

# 1. КАТАЛОГ
@router.message(F.text == "🛍 Открыть магазин")
async def open_shop(message: types.Message, state: FSMContext):
    data = await state.get_data()
    seller_id = data.get("current_seller_id", message.from_user.id) # Если нет ID, показываем свои же (тест)
    
    # Получаем товары через API
    products = await api_get_products(seller_id)
    
    if not products:
        return await message.answer("В этом магазине пока нет товаров. 🌸")

    for product in products:
        buy_kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="➕ В корзину", callback_data=f"buy_{product.id}_{product.name}_{product.price}")]
        ])
        await message.answer_photo(
            photo=product.photo_id,
            caption=f"🌸 *{product.name}*\n💰 {product.price} руб.\n\n{product.description}",
            reply_markup=buy_kb,
            parse_mode="Markdown"
        )

# 2. КОРЗИНА (Локальная логика, API не нужен до оформления)
@router.message(F.text == "🛒 Корзина")
async def show_cart(message: types.Message, state: FSMContext):
    data = await state.get_data()
    cart = data.get("cart", {}) # Структура: {id: {'name': name, 'price': price, 'count': 1}}
    
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

# 3. ДОБАВЛЕНИЕ В КОРЗИНУ
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

# 4. ОФОРМЛЕНИЕ
@router.callback_query(F.data == "checkout")
async def checkout_start(callback: types.CallbackQuery, state: FSMContext):
    await state.set_state(Checkout.phone)
    await callback.message.answer("Шаг 1/3: Введите ваш номер телефона:")
    await callback.answer()

@router.message(Checkout.phone)
async def checkout_phone(message: types.Message, state: FSMContext):
    await state.update_data(phone=message.text)
    await state.set_state(Checkout.delivery_choice)
    
    choice_kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🚚 Доставка", callback_data="target_delivery")],
        [InlineKeyboardButton(text="🏠 Самовывоз", callback_data="target_pickup")]
    ])
    await message.answer("Шаг 2/3: Как вы хотите получить заказ?", reply_markup=choice_kb)

@router.callback_query(F.data == "target_pickup")
async def process_pickup(callback: types.CallbackQuery, state: FSMContext):
    # Получаем адрес магазина через API
    data = await state.get_data()
    seller_id = data.get("current_seller_id", callback.from_user.id)
    seller = await api_get_seller(seller_id)
    addr = getattr(seller, 'address', "Адрес магазина уточняйте у продавца")
    
    await finalize_order(callback.message, state, "Самовывоз", addr)
    await callback.answer()

@router.callback_query(F.data == "target_delivery")
async def process_delivery(callback: types.CallbackQuery, state: FSMContext):
    await state.set_state(Checkout.address)
    await callback.message.edit_text("Шаг 3/3: Введите адрес доставки:")
    await callback.answer()

@router.message(Checkout.address)
async def checkout_address(message: types.Message, state: FSMContext):
    await finalize_order(message, state, "Доставка", message.text)

async def finalize_order(message, state: FSMContext, type_name, final_address):
    data = await state.get_data()
    cart = data.get("cart", {})
    seller_id = data.get("current_seller_id", 8073613186)
    
    # Формируем описание заказа
    items_desc = ""
    total = 0
    for item in cart.values():
        items_desc += f"{item['name']} x {item['count']}; "
        total += item['price'] * item['count']

    # ❗ СОЗДАНИЕ ЗАКАЗА ЧЕРЕЗ API
    order_data = {
        "buyer_id": message.chat.id,
        "seller_id": seller_id,
        "items_info": items_desc,
        "total_price": total,
        "delivery_type": type_name,
        "address": final_address,
        "agent_id": data.get("current_agent_id")
    }
    
    try:
        new_order = await api_create_order(order_data)
        
        # Уведомление продавца (пока оставляем тут для надежности, но в идеале это делает бэкенд)
        try:
            await message.bot.send_message(
                seller_id, 
                f"🔔 *НОВЫЙ ЗАКАЗ №{new_order.id}*\n"
                f"📱 Тел: {data['phone']}\n"
                f"📍 {type_name}: {final_address}\n"
                f"💰 Сумма: {total} руб.\n"
                f"🛒 Товары: {items_desc}",
                parse_mode="Markdown"
            )
        except:
            pass # Если бот не может написать продавцу, не крашим заказ

        await state.clear()
        text = f"🎉 Заказ №{new_order.id} успешно оформлен!\n📍 {type_name}: {final_address}"
        
        if isinstance(message, types.Message):
            await message.answer(text)
        else:
            await message.edit_text(text)
            
    except Exception as e:
        if isinstance(message, types.Message):
            await message.answer(f"Ошибка при создании заказа: {e}")
        else:
            await message.bot.send_message(message.chat.id, f"Ошибка: {e}")