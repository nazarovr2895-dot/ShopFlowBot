from aiogram import Router, F, types
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from bot.database.requests import get_products_by_ids, create_order, get_shop_info, get_products_by_seller
import bot.keyboards.reply as kb

router = Router()

class Checkout(StatesGroup):
    phone = State()
    delivery_choice = State()
    address = State()

# 1. КАТАЛОГ (🛍 Открыть магазин)
@router.message(F.text == "🛍 Открыть магазин")
async def open_shop(message: types.Message, state: FSMContext):
    data = await state.get_data()
    # Берем ID из ссылки или текущего пользователя для теста
    seller_id = data.get("current_seller_id", message.from_user.id)
    products = await get_products_by_seller(seller_id)
    
    if not products:
        return await message.answer("В этом магазине пока нет товаров. 🌸")

    for product in products:
        buy_kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="➕ В корзину", callback_data=f"buy_{product.id}")]
        ])
        await message.answer_photo(
            photo=product.photo_id,
            caption=f"🌸 *{product.name}*\n💰 {product.price} руб.\n\n{product.description}",
            reply_markup=buy_kb,
            parse_mode="Markdown"
        )

# 2. ВИЗУАЛЬНАЯ КОРЗИНА
@router.message(F.text == "🛒 Корзина")
async def show_cart(message: types.Message, state: FSMContext):
    data = await state.get_data()
    cart = data.get("cart", {})
    if not cart:
        return await message.answer("Ваша корзина пуста 🛒")

    product_ids = [int(p_id) for p_id in cart.keys()]
    products = await get_products_by_ids(product_ids)
    
    total_price = 0
    await message.answer("📦 *Ваши товары в корзине:*", parse_mode="Markdown")

    for product in products:
        count = cart.get(str(product.id))
        item_total = product.price * count
        total_price += item_total
        
        await message.answer_photo(
            photo=product.photo_id,
            caption=f"🌸 *{product.name}*\n💰 {product.price} x {count} шт. = {item_total} руб.",
            parse_mode="Markdown"
        )
    
    summary_kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ Оформить заказ", callback_data="checkout")],
        [InlineKeyboardButton(text="🗑 Очистить всё", callback_data="clear_cart")]
    ])
    await message.answer(f"ИТОГО К ОПЛАТЕ: *{total_price} руб.*", 
                         reply_markup=summary_kb, parse_mode="Markdown")

# 3. ОФОРМЛЕНИЕ ЗАКАЗА С ВЫБОРОМ
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
    data = await state.get_data()
    seller_id = data.get("current_seller_id", callback.from_user.id)
    shop = await get_shop_info(seller_id)
    addr = shop.address if shop and shop.address else "Адрес не указан"
    
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
    cart = data.get("cart")
    seller_id = data.get("current_seller_id", 8073613186) 
    agent_id = data.get("current_agent_id") # Получаем ID агента, если он есть
    
# 1. Сохраняем заказ в базу
    await create_order(
        buyer_id=message.chat.id,
        items_info=str(cart),
        total_price=0, 
        phone=data['phone'],
        address=f"[{type_name}] {final_address}",
        agent_id=agent_id # Добавляем связь с агентом
    )
    
    # 2. УВЕДОМЛЯЕМ ПРОДАВЦА
    try:
        # ПРАВИЛЬНЫЙ СПОСОБ: берем bot прямо из объекта message
        await message.bot.send_message(
            seller_id, 
            f"🔔 *НОВЫЙ ЗАКАЗ!*\n\n"
            f"📱 Тел: {data['phone']}\n"
            f"📍 Тип: {type_name}\n"
            f"🏠 Адрес: {final_address}\n"
            f"🛒 Товары: {cart}" + 
            (f"\n🤝 Посредник: {agent_id}" if agent_id else ""), 
            parse_mode="Markdown"
        )
    except Exception as e:
        print(f"Ошибка уведомления продавца: {e}")

    await state.clear()
    
    # Финальный ответ пользователю
    text = f"🎉 Заказ успешно оформлен ({type_name})!\n📍 Адрес: {final_address}\nПродавец свяжется с вами."
    
    if isinstance(message, types.Message):
        await message.answer(text)
    else:
        await message.edit_text(text)

@router.callback_query(F.data.startswith("buy_"))
async def add_to_cart(callback: types.CallbackQuery, state: FSMContext):
    p_id = callback.data.split("_")[1]
    data = await state.get_data()
    
    # Создаем копию словаря корзины, чтобы Redis точно увидел изменения
    cart = dict(data.get("cart", {})) 
    cart[p_id] = cart.get(p_id, 0) + 1
    
    await state.update_data(cart=cart)
    await callback.answer(f"✅ Добавлено! Всего в корзине: {cart[p_id]} шт.")