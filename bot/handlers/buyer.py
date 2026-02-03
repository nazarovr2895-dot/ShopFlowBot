from aiogram import Router, F, types
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, KeyboardButton, WebAppInfo
import bot.keyboards.reply as kb
from bot.api_client.sellers import api_get_products, api_get_seller, api_get_buyer_orders, api_update_order_status, api_get_product
from bot.api_client.orders import api_create_order
from bot.config import MINI_APP_URL, BACKEND_URL

router = Router()

def format_items_info(items_info: str) -> str:
    """Форматирует items_info для отображения, убирая ID товаров"""
    import re
    # Формат: "ID:название x количество, ID:название x количество"
    # Преобразуем в: "название x количество, название x количество"
    pattern = r'(\d+):([^x]+)\s*x\s*(\d+)'
    def replace(match):
        product_id, product_name, quantity = match.groups()
        return f"{product_name.strip()} x {quantity}"
    return re.sub(pattern, replace, items_info)

class Checkout(StatesGroup):
    fio = State()
    phone = State()
    delivery_choice = State()
    address = State()

async def show_shop_products(message: types.Message, seller_id: int):
    """Вспомогательная функция для показа товаров магазина"""
    # Получаем товары через API
    products = await api_get_products(seller_id)
    
    if not products:
        await message.answer("📭 В этом магазине пока нет товаров.")
        return

    # Показываем товары (только с количеством > 0)
    for product in products:
        # Проверяем количество товара
        quantity = getattr(product, 'quantity', 0)
        if quantity <= 0:
            continue  # Пропускаем товары с нулевым количеством
        
        # product - это объект, который мы сделали в api_client
        buy_kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="➕ В корзину", callback_data=f"buy_{product.id}_{product.name}_{product.price}")]
        ])
        
        # Формируем описание с количеством
        quantity_text = f"📦 В наличии: {quantity} шт.\n" if quantity > 0 else ""
        caption = f"🌸 *{product.name}*\n💰 {product.price} руб.\n{quantity_text}\n{product.description}"
        
        # Если есть фото: Telegram принимает только file_id или полный HTTP(S) URL
        if hasattr(product, 'photo_id') and product.photo_id:
            photo = product.photo_id
            if photo.startswith("/"):
                photo = f"{BACKEND_URL.rstrip('/')}{photo}"
            await message.answer_photo(
                photo=photo,
                caption=caption,
                reply_markup=buy_kb,
                parse_mode="Markdown"
            )
        else:
            await message.answer(
                caption,
                reply_markup=buy_kb,
                parse_mode="Markdown"
            )

# --- 1. ОТКРЫТЬ МАГАЗИН ---
@router.message(F.text == "🌸 Открыть магазин")
async def open_shop(message: types.Message, state: FSMContext):
    data = await state.get_data()
    
    # 1. Пытаемся понять, в чьем мы магазине
    seller_id = data.get("current_seller_id")
    
    # Если мы не переходили по ссылке, предлагаем выбрать магазин в mini app
    if not seller_id:
        mini_app_kb = ReplyKeyboardMarkup(keyboard=[
            [KeyboardButton(text="🛍 Перейти в каталог", web_app=WebAppInfo(url=MINI_APP_URL))]
        ], resize_keyboard=True)
        await message.answer(
            "⚠️ Вы еще не выбрали магазин.\n\n"
            "Пожалуйста, выберите магазин из каталога, чтобы просмотреть товары.",
            reply_markup=mini_app_kb
        )
        return

    # Показываем товары магазина
    await show_shop_products(message, seller_id)

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
    p_id = int(parts[1])
    p_name = parts[2]
    p_price = float(parts[3])

    # Проверяем доступное количество товара
    product = await api_get_product(p_id)
    if not product:
        await callback.answer("❌ Товар не найден!", show_alert=True)
        return
    
    available_quantity = getattr(product, 'quantity', 0)
    if available_quantity <= 0:
        await callback.answer("❌ Товар закончился!", show_alert=True)
        return

    data = await state.get_data()
    cart = dict(data.get("cart", {}))
    
    # Проверяем, сколько уже в корзине
    current_count = cart.get(str(p_id), {}).get('count', 0)
    if current_count >= available_quantity:
        await callback.answer(f"❌ Максимальное количество: {available_quantity} шт.", show_alert=True)
        return
    
    if str(p_id) in cart:
        cart[str(p_id)]['count'] += 1
    else:
        cart[str(p_id)] = {'name': p_name, 'price': p_price, 'count': 1}
    
    await state.update_data(cart=cart)
    await callback.answer(f"✅ {p_name} добавлен в корзину!")

# --- 4. ОФОРМЛЕНИЕ ЗАКАЗА ---
@router.callback_query(F.data == "checkout")
async def checkout_start(callback: types.CallbackQuery, state: FSMContext):
    # Сохраняем снимок корзины на момент оформления
    data = await state.get_data()
    cart = data.get("cart", {})
    
    if not cart:
        await callback.answer("❌ Корзина пуста!", show_alert=True)
        return
    
    # Вычисляем итоги заранее и сохраняем
    # Формат: "ID:название x количество, ID:название x количество"
    items_info = ", ".join([f"{p_id}:{v['name']} x {v['count']}" for p_id, v in cart.items()])
    total_price = sum([v['price'] * v['count'] for v in cart.values()])
    
    # Сохраняем корзину для уменьшения количества
    await state.update_data(
        checkout_items_info=items_info,
        checkout_total_price=total_price,
        checkout_cart=cart  # Сохраняем корзину с ID товаров
    )
    
    await state.set_state(Checkout.fio)
    await callback.message.answer("Введите ваше ФИО (Имя Фамилия):")
    await callback.answer()

@router.message(Checkout.fio)
async def checkout_fio(message: types.Message, state: FSMContext):
    await state.update_data(fio=message.text)
    await state.set_state(Checkout.phone)
    await message.answer("Введите ваш номер телефона:")

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
    
    # Если выбран самовывоз - отправляем адрес магазина
    if callback.data == "target_pickup":
        data = await state.get_data()
        seller_id = data.get("current_seller_id", 8073613186)
        
        # Получаем информацию о продавце
        seller = await api_get_seller(seller_id)
        
        if seller and hasattr(seller, 'map_url') and seller.map_url:
            # Отправляем адрес магазина пользователю
            await callback.message.answer(
                f"📍 *Адрес магазина для самовывоза:*\n\n"
                f"{seller.map_url}\n\n"
                f"Вы можете забрать заказ по этому адресу.",
                parse_mode="Markdown"
            )
            # Сохраняем адрес магазина как адрес заказа
            await state.update_data(address=seller.map_url)
            # Переходим к завершению заказа
            await finish_order_with_address(callback.message, state, callback.from_user.id)
        else:
            # Если адрес магазина не указан, сообщаем об этом
            await callback.message.answer(
                "⚠️ Адрес магазина не указан. Пожалуйста, свяжитесь с продавцом для уточнения адреса самовывоза."
            )
            await state.clear()
    else:
        # Если выбрана доставка - запрашиваем адрес у пользователя
        await state.set_state(Checkout.address)
        await callback.message.answer(f"Введите адрес доставки:")
    
    await callback.answer()

async def finish_order_with_address(message: types.Message, state: FSMContext, user_id: int = None):
    """Вспомогательная функция для завершения заказа с уже сохраненным адресом"""
    data = await state.get_data()
    
    # Используем переданный user_id или берем из message
    buyer_id = user_id if user_id is not None else message.from_user.id
    
    # Пытаемся взять ID продавца из перехода по ссылке
    # Если его нет — берем ТВОЙ ID (как дефолтный магазин)
    seller_id = data.get("current_seller_id", 8073613186) 
    
    # Получаем информацию о продавце для стоимости доставки
    seller = await api_get_seller(seller_id)
    delivery_price = 0.0
    if seller and hasattr(seller, 'delivery_price'):
        delivery_price = getattr(seller, 'delivery_price', 0.0)
    
    # Используем сохраненные данные из checkout_start
    items_info = data.get("checkout_items_info", "")
    total = data.get("checkout_total_price", 0)
    fio = data.get("fio", "")
    phone = data.get("phone", "")
    delivery_type = data.get("delivery_type", "")
    address = data.get("address", "")
    
    # Если выбрана доставка и она платная, добавляем стоимость доставки к итогу
    final_total = total
    delivery_text = ""
    if delivery_type == "Доставка" and delivery_price > 0:
        final_total = total + delivery_price
        delivery_text = f"\n🚚 Доставка: {delivery_price} руб."
    elif delivery_type == "Доставка" and delivery_price == 0:
        delivery_text = "\n🚚 Доставка: бесплатно"
    
    # Добавляем ФИО и телефон к адресу для информации продавцу
    full_address = f"{address}\n📞 {phone}\n👤 {fio}"

    order_payload = {
        "buyer_id": buyer_id,
        "seller_id": seller_id,
        "items_info": items_info,
        "total_price": final_total,
        "delivery_type": delivery_type,
        "address": full_address,
        "agent_id": data.get("current_agent_id")
    }

    # Отправляем запрос
    res = await api_create_order(order_payload)
    
    # --- ПРОВЕРКА РЕЗУЛЬТАТА ---
    if res:
        await message.answer(
            f"🎉 *Заказ №{res.id} оформлен!*\n\n"
            f"👤 {fio}\n"
            f"📞 {phone}\n"
            f"🛒 {format_items_info(items_info)}\n"
            f"💰 Товары: {total} руб.{delivery_text}\n"
            f"💰 *Итого: {final_total} руб.*\n\n"
            "Ожидайте подтверждения от продавца.",
            parse_mode="Markdown"
        )
        await state.clear() # Очищаем корзину и состояние только при успехе
    else:
        # Не очищаем состояние при ошибке, чтобы можно было повторить
        menu = kb.get_main_kb(buyer_id, "BUYER")
        await message.answer(
            "❌ *Ошибка оформления заказа!*\n\n"
            "Возможные причины:\n"
            "1. Продавец перестал существовать.\n"
            "2. Магазин временно закрыт.\n"
            "3. Лимит заказов продавца превышен.\n\n"
            "Попробуйте связаться с администратором.",
            parse_mode="Markdown",
            reply_markup=menu
        )

@router.message(Checkout.address)
async def checkout_finish(message: types.Message, state: FSMContext):
    # Сохраняем адрес из сообщения пользователя
    await state.update_data(address=message.text)
    # Используем общую функцию для завершения заказа
    await finish_order_with_address(message, state)


# --- 5. МОИ ЗАКАЗЫ ---
@router.message(F.text == "📦 Мои заказы")
async def my_orders_handler(message: types.Message):
    """Показать заказы покупателя"""
    buyer_id = message.from_user.id
    orders = await api_get_buyer_orders(buyer_id)
    
    if not orders:
        return await message.answer("📭 У вас пока нет заказов.")
    
    await message.answer(f"📦 Ваши заказы: {len(orders)}")
    
    # Статусы на русском с эмодзи
    status_names = {
        "pending": "⏳ Ожидает подтверждения",
        "accepted": "✅ Принят продавцом",
        "assembling": "📦 Собирается",
        "in_transit": "🚚 В пути",
        "done": "📬 Доставлен (ожидает подтверждения)",
        "completed": "✅ Получен",
        "rejected": "❌ Отклонен"
    }
    
    for order in orders:
        status_text = status_names.get(order.status, order.status)
        delivery_emoji = "🚚" if order.delivery_type == "Доставка" else "🏪"
        
        # Адрес доставки или самовывоза (в заказе хранится в address)
        addr = (order.address or "").strip()
        addr_display = addr.replace("\n", " · ") if addr else ""
        if addr_display:
            delivery_line = f"{delivery_emoji} {order.delivery_type}: {addr_display}"
        else:
            delivery_line = f"{delivery_emoji} {order.delivery_type}"
        
        # Проверяем, была ли изменена цена
        price_text = f"💰 Сумма: *{order.total_price} руб.*"
        if hasattr(order, 'original_price') and order.original_price and abs(float(order.original_price) - float(order.total_price)) > 0.01:
            price_text = (
                f"💰 Сумма: *{order.total_price} руб.*\n"
                f"   (было: {order.original_price} руб.)"
            )
        
        text = (
            f"📦 *Заказ #{order.id}*\n"
            f"━━━━━━━━━━━━━━━\n"
            f"📊 Статус: *{status_text}*\n"
            f"🛒 Товары: {format_items_info(order.items_info)}\n"
            f"{price_text}\n"
            f"{delivery_line}\n"
        )
        
        if order.created_at:
            text += f"🕐 Создан: {order.created_at[:16].replace('T', ' ')}\n"
        
        # Кнопки действий в зависимости от статуса
        buttons = []
        
        # Если заказ активен или доставлен - можно подтвердить получение
        # НЕ показываем для completed (уже подтвержден) и rejected (отклонен)
        if order.status in ["in_transit", "assembling", "accepted", "done"]:
            buttons.append([
                InlineKeyboardButton(
                    text="✅ Я получил заказ", 
                    callback_data=f"buyer_confirm_{order.id}"
                )
            ])
        
        # Кнопка связи с продавцом
        buttons.append([
            InlineKeyboardButton(
                text="💬 Связаться с продавцом", 
                url=f"tg://user?id={order.seller_id}"
            )
        ])
        
        kb_order = InlineKeyboardMarkup(inline_keyboard=buttons) if buttons else None
        
        await message.answer(text, reply_markup=kb_order, parse_mode="Markdown")


@router.callback_query(F.data.startswith("buyer_confirm_"))
async def buyer_confirm_order(callback: types.CallbackQuery):
    """Покупатель подтверждает получение - показываем подтверждение"""
    order_id = int(callback.data.split("_")[2])
    
    confirm_kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="✅ Да, получил", callback_data=f"buyer_received_{order_id}"),
            InlineKeyboardButton(text="❌ Нет, отмена", callback_data=f"buyer_cancel_{order_id}")
        ]
    ])
    
    await callback.message.edit_reply_markup(reply_markup=confirm_kb)
    await callback.answer("Подтвердите получение заказа")


@router.callback_query(F.data.startswith("buyer_received_"))
async def buyer_received_order(callback: types.CallbackQuery):
    """Покупатель подтвердил получение заказа"""
    order_id = int(callback.data.split("_")[2])
    
    # Устанавливаем статус "completed" - покупатель подтвердил получение
    result = await api_update_order_status(order_id, "completed")
    
    if result and result.get("status") == "ok":
        await callback.answer("✅ Спасибо! Заказ отмечен как полученный.", show_alert=True)
        await callback.message.edit_text(
            callback.message.text + "\n\n✅ *ЗАКАЗ ПОЛУЧЕН*",
            parse_mode="Markdown"
        )
    else:
        await callback.answer("❌ Ошибка при обновлении статуса", show_alert=True)


@router.callback_query(F.data.startswith("buyer_cancel_"))
async def buyer_cancel_confirm(callback: types.CallbackQuery):
    """Покупатель отменил подтверждение"""
    await callback.answer("Отменено")
    # Возвращаем исходные кнопки
    order_id = int(callback.data.split("_")[2])
    
    buttons = [
        [InlineKeyboardButton(text="✅ Я получил заказ", callback_data=f"buyer_confirm_{order_id}")],
        [InlineKeyboardButton(text="💬 Связаться с продавцом", url=f"tg://user?id=0")]
    ]
    
    await callback.message.edit_reply_markup(reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons))