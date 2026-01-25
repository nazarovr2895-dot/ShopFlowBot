from aiogram import Router, F, types, Bot
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
import bot.keyboards.reply as kb

# Импорт API
from bot.api_client.sellers import (
    api_check_limit, api_get_seller, api_create_product, api_get_my_products, api_delete_product,
    api_get_seller_orders, api_accept_order, api_reject_order, api_done_order,
    api_update_seller_limit, api_get_seller_revenue_stats, api_update_order_status
)

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
        d_kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="🗑 Удалить", callback_data=f"delete_product_{p.id}")]])
        caption = f"🏷 *{p.name}*\n📝 {p.description}\n💰 *{p.price} руб.*"
        if p.photo_id:
            await message.answer_photo(p.photo_id, caption=caption, reply_markup=d_kb, parse_mode="Markdown")
        else:
            await message.answer(caption, reply_markup=d_kb, parse_mode="Markdown")

@router.callback_query(F.data.startswith("delete_product_"))
async def delete_product_handler(callback: types.CallbackQuery):
    await api_delete_product(int(callback.data.split("_")[2]))
    await callback.message.delete()
    await callback.answer("✅ Товар удален")


# --- 4. ЗАПРОСЫ НА ПОКУПКУ (pending orders) ---
@router.message(F.text == "📩 Запросы на покупку")
async def purchase_requests_handler(message: types.Message):
    """Показать ожидающие заказы (pending)"""
    seller_id = message.from_user.id
    orders = await api_get_seller_orders(seller_id, status="pending")
    
    if not orders:
        return await message.answer("📭 Новых запросов на покупку нет.")
    
    await message.answer(f"📩 Запросы на покупку: {len(orders)}")
    
    for order in orders:
        # Формируем информацию о заказе
        delivery_emoji = "🚚" if order.delivery_type == "delivery" else "🏪"
        delivery_text = "Доставка" if order.delivery_type == "delivery" else "Самовывоз"
        
        text = (
            f"📦 *Заказ #{order.id}*\n"
            f"━━━━━━━━━━━━━━━\n"
            f"👤 Покупатель ID: `{order.buyer_id}`\n"
            f"🛒 Товары: {order.items_info}\n"
            f"💰 Сумма: *{order.total_price} руб.*\n"
            f"{delivery_emoji} Тип: {delivery_text}\n"
        )
        
        if order.address:
            text += f"📍 Адрес: {order.address}\n"
        
        if order.created_at:
            text += f"🕐 Создан: {order.created_at[:16].replace('T', ' ')}\n"
        
        # Кнопки действий
        kb_order = InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Принять", callback_data=f"order_accept_{order.id}"),
                InlineKeyboardButton(text="❌ Отклонить", callback_data=f"order_reject_{order.id}")
            ],
            [
                InlineKeyboardButton(text="💬 Связаться", url=f"tg://user?id={order.buyer_id}")
            ]
        ])
        
        await message.answer(text, reply_markup=kb_order, parse_mode="Markdown")


@router.callback_query(F.data.startswith("order_accept_"))
async def accept_order_callback(callback: types.CallbackQuery):
    """Принять заказ"""
    order_id = int(callback.data.split("_")[2])
    result = await api_accept_order(order_id)
    
    if result and result.get("status") == "ok":
        await callback.answer("✅ Заказ принят! Теперь он в активных.", show_alert=True)
        # Обновляем сообщение
        await callback.message.edit_text(
            callback.message.text + "\n\n✅ *ЗАКАЗ ПРИНЯТ*",
            parse_mode="Markdown"
        )
    else:
        await callback.answer("❌ Ошибка при принятии заказа", show_alert=True)


@router.callback_query(F.data.startswith("order_reject_"))
async def reject_order_callback(callback: types.CallbackQuery):
    """Отклонить заказ"""
    order_id = int(callback.data.split("_")[2])
    result = await api_reject_order(order_id)
    
    if result and result.get("status") == "ok":
        await callback.answer("❌ Заказ отклонен", show_alert=True)
        await callback.message.edit_text(
            callback.message.text + "\n\n❌ *ЗАКАЗ ОТКЛОНЕН*",
            parse_mode="Markdown"
        )
    else:
        await callback.answer("❌ Ошибка при отклонении заказа", show_alert=True)


# --- 5. АКТИВНЫЕ ЗАКАЗЫ (все кроме pending, rejected, done) ---
@router.message(F.text == "⚡️ Активные заказы")
async def active_orders_handler(message: types.Message):
    """Показать активные заказы (accepted, assembling, in_transit)"""
    seller_id = message.from_user.id
    
    # Получаем заказы по всем активным статусам
    all_orders = []
    for status in ["accepted", "assembling", "in_transit"]:
        orders = await api_get_seller_orders(seller_id, status=status)
        all_orders.extend(orders)
    
    if not all_orders:
        return await message.answer("📭 Активных заказов нет.")
    
    await message.answer(f"⚡️ Активных заказов: {len(all_orders)}")
    
    # Статусы на русском
    status_names = {
        "accepted": "✅ Принят",
        "assembling": "📦 Собирается",
        "in_transit": "🚚 В пути"
    }
    
    for order in all_orders:
        delivery_emoji = "🚚" if order.delivery_type == "Доставка" else "🏪"
        status_text = status_names.get(order.status, order.status)
        
        text = (
            f"📦 *Заказ #{order.id}*\n"
            f"━━━━━━━━━━━━━━━\n"
            f"📊 Статус: *{status_text}*\n"
            f"👤 Покупатель ID: `{order.buyer_id}`\n"
            f"🛒 Товары: {order.items_info}\n"
            f"💰 Сумма: *{order.total_price} руб.*\n"
            f"{delivery_emoji} {order.delivery_type or 'Не указано'}\n"
        )
        
        if order.address:
            text += f"📍 Адрес:\n{order.address}\n"
        
        # Кнопки управления статусом в зависимости от текущего статуса
        buttons = []
        
        if order.status == "accepted":
            buttons.append([
                InlineKeyboardButton(text="📦 Собирается", callback_data=f"status_assembling_{order.id}")
            ])
        
        if order.status in ["accepted", "assembling"]:
            buttons.append([
                InlineKeyboardButton(text="🚚 В пути", callback_data=f"status_in_transit_{order.id}")
            ])
        
        # Кнопка завершения всегда доступна
        buttons.append([
            InlineKeyboardButton(text="✅ Выполнен", callback_data=f"status_done_{order.id}")
        ])
        
        buttons.append([
            InlineKeyboardButton(text="💬 Связаться", url=f"tg://user?id={order.buyer_id}")
        ])
        
        kb_order = InlineKeyboardMarkup(inline_keyboard=buttons)
        await message.answer(text, reply_markup=kb_order, parse_mode="Markdown")


@router.callback_query(F.data.startswith("status_"))
async def update_order_status_callback(callback: types.CallbackQuery):
    """Изменить статус заказа"""
    # Формат: status_СТАТУС_ID (статус может содержать _)
    # Парсим: убираем "status_" и берем последнюю часть как ID
    data = callback.data[7:]  # убираем "status_"
    last_underscore = data.rfind("_")
    new_status = data[:last_underscore]  # assembling, in_transit, done
    order_id = int(data[last_underscore + 1:])
    
    result = await api_update_order_status(order_id, new_status)
    
    status_messages = {
        "assembling": "📦 Заказ отмечен как 'Собирается'",
        "in_transit": "🚚 Заказ отмечен как 'В пути'",
        "done": "✅ Заказ выполнен!"
    }
    
    if result and result.get("status") == "ok":
        msg = status_messages.get(new_status, "Статус обновлен")
        await callback.answer(msg, show_alert=True)
        
        # Обновляем текст сообщения
        status_emoji = {"assembling": "📦 Собирается", "in_transit": "🚚 В пути", "done": "✅ Выполнен"}
        new_status_text = status_emoji.get(new_status, new_status)
        
        if new_status == "done":
            await callback.message.edit_text(
                callback.message.text + f"\n\n✅ *ЗАКАЗ ВЫПОЛНЕН*",
                parse_mode="Markdown"
            )
        else:
            # Обновляем кнопки для нового статуса
            buttons = []
            
            if new_status == "assembling":
                buttons.append([
                    InlineKeyboardButton(text="🚚 В пути", callback_data=f"status_in_transit_{order_id}")
                ])
            
            buttons.append([
                InlineKeyboardButton(text="✅ Выполнен", callback_data=f"status_done_{order_id}")
            ])
            buttons.append([
                InlineKeyboardButton(text="💬 Связаться", url=f"tg://user?id=0")
            ])
            
            await callback.message.edit_reply_markup(
                reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons)
            )
    else:
        await callback.answer("❌ Ошибка при обновлении статуса", show_alert=True)


# Удаляем старый callback для done, теперь используется общий status_
@router.callback_query(F.data.startswith("order_done_"))
async def done_order_callback_legacy(callback: types.CallbackQuery):
    """Завершить заказ (старый формат для совместимости)"""
    order_id = int(callback.data.split("_")[2])
    result = await api_done_order(order_id)
    
    if result and result.get("status") == "ok":
        await callback.answer("✅ Заказ выполнен!", show_alert=True)
        await callback.message.edit_text(
            callback.message.text + "\n\n✅ *ЗАКАЗ ВЫПОЛНЕН*",
            parse_mode="Markdown"
        )
    else:
        await callback.answer("❌ Ошибка при завершении заказа", show_alert=True)


# --- 6. НАСТРОЙКА ЛИМИТОВ ---
@router.message(F.text == "⚙️ Настройка лимитов")
async def settings_limit_start(message: types.Message, state: FSMContext):
    """Начало настройки лимитов"""
    seller = await api_get_seller(message.from_user.id)
    
    current_limit = seller.max_orders if seller else 10
    current_active = seller.active_orders if seller else 0
    current_pending = seller.pending_requests if seller else 0
    
    text = (
        f"⚙️ *Настройка лимитов*\n"
        f"━━━━━━━━━━━━━━━\n"
        f"📊 Текущий лимит: *{current_limit}* заказов\n"
        f"⚡️ Активных: {current_active}\n"
        f"📩 Ожидающих: {current_pending}\n"
        f"📈 Свободно слотов: {current_limit - current_active - current_pending}\n\n"
        f"Введите новый лимит (от 1 до 100):"
    )
    
    await state.set_state(SellerSettings.waiting_for_limit)
    await message.answer(text, reply_markup=kb.cancel_kb, parse_mode="Markdown")


@router.message(SellerSettings.waiting_for_limit)
async def settings_limit_process(message: types.Message, state: FSMContext):
    """Обработка нового лимита"""
    if message.text == "❌ Отмена":
        await state.clear()
        menu = kb.get_main_kb(message.from_user.id, "SELLER")
        return await message.answer("Отменено.", reply_markup=menu)
    
    # Проверка ввода
    if not message.text.isdigit():
        return await message.answer("❌ Введите число от 1 до 100")
    
    new_limit = int(message.text)
    
    if new_limit < 1 or new_limit > 100:
        return await message.answer("❌ Лимит должен быть от 1 до 100")
    
    # Обновляем через API
    result = await api_update_seller_limit(message.from_user.id, new_limit)
    
    menu = kb.get_main_kb(message.from_user.id, "SELLER")
    
    if result and result.get("status") == "ok":
        await message.answer(
            f"✅ Лимит успешно изменен на *{new_limit}* заказов!",
            reply_markup=menu,
            parse_mode="Markdown"
        )
    else:
        await message.answer("❌ Ошибка при обновлении лимита", reply_markup=menu)
    
    await state.clear()


# --- 7. ОТЧЕТ ПО ВЫРУЧКЕ ---
@router.message(F.text == "📊 Отчет по выручке")
async def seller_report_handler(message: types.Message):
    """Отчет по выручке продавца"""
    seller_id = message.from_user.id
    stats = await api_get_seller_revenue_stats(seller_id)
    
    if not stats:
        return await message.answer("📊 Статистика пока недоступна.")
    
    total_orders = stats.get("total_completed_orders", 0)
    total_revenue = stats.get("total_revenue", 0)
    commission = stats.get("commission_18", 0)
    net_revenue = stats.get("net_revenue", 0)
    orders_by_status = stats.get("orders_by_status", {})
    
    # Статусы на русском
    status_names = {
        "pending": "⏳ Ожидают",
        "accepted": "⚡️ В работе",
        "rejected": "❌ Отклонены",
        "done": "✅ Выполнены"
    }
    
    status_text = ""
    for status, count in orders_by_status.items():
        name = status_names.get(status, status)
        status_text += f"   {name}: {count}\n"
    
    text = (
        f"📊 *Отчет по выручке*\n"
        f"━━━━━━━━━━━━━━━\n\n"
        f"📦 *Заказы по статусам:*\n"
        f"{status_text or '   Нет данных'}\n"
        f"━━━━━━━━━━━━━━━\n"
        f"✅ Выполнено заказов: *{total_orders}*\n\n"
        f"💰 *Финансы:*\n"
        f"   Общая выручка: *{total_revenue:,.2f} руб.*\n"
        f"   Комиссия (18%): *{commission:,.2f} руб.*\n"
        f"   ━━━━━━━━━━━━━━━\n"
        f"   💵 К получению: *{net_revenue:,.2f} руб.*\n"
    )
    
    await message.answer(text, parse_mode="Markdown")


# --- 8. ДОБАВЛЕНИЕ ТОВАРА ---
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