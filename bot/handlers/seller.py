from aiogram import Router, F, types, Bot
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
import bot.keyboards.reply as kb
from bot.config import MASTER_ADMIN_ID, BACKEND_URL

# Импорт API
from bot.api_client.sellers import (
    api_check_limit, api_get_seller, api_create_product, api_get_my_products, api_delete_product,
    api_get_seller_orders, api_accept_order, api_reject_order, api_done_order,
    api_update_seller_limit, api_get_seller_revenue_stats, api_update_order_status,
    api_update_order_price, api_get_bouquets,
)

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

class AddProduct(StatesGroup):
    name = State(); description = State(); price = State(); quantity = State(); photo = State()

class SellerSettings(StatesGroup):
    waiting_for_limit = State()

class ChangeOrderPrice(StatesGroup):
    waiting_for_price = State()
    waiting_for_confirm = State()

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
    
    # Фильтруем товары с количеством > 0 для отображения
    available_products = [p for p in products if getattr(p, 'quantity', 0) > 0]
    out_of_stock_products = [p for p in products if getattr(p, 'quantity', 0) <= 0]
    
    await message.answer(f"📦 Найдено товаров: {len(products)} (в наличии: {len(available_products)}, закончились: {len(out_of_stock_products)})")
    
    # Показываем только товары в наличии
    for p in available_products:
        quantity = getattr(p, 'quantity', 0)
        d_kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="🗑 Удалить", callback_data=f"delete_product_{p.id}")]])
        caption = f"🏷 *{p.name}*\n📝 {p.description}\n💰 *{p.price} руб.*\n📦 В наличии: {quantity} шт."
        if p.photo_id:
            photo = f"{BACKEND_URL.rstrip('/')}{p.photo_id}" if p.photo_id.startswith("/") else p.photo_id
            await message.answer_photo(photo, caption=caption, reply_markup=d_kb, parse_mode="Markdown")
        else:
            await message.answer(caption, reply_markup=d_kb, parse_mode="Markdown")
    
    # Показываем товары, которые закончились
    if out_of_stock_products:
        await message.answer(f"\n⚠️ *Товары, которые закончились (не отображаются покупателям):*")
        for p in out_of_stock_products:
            d_kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="🗑 Удалить", callback_data=f"delete_product_{p.id}")]])
            caption = f"🏷 *{p.name}*\n📝 {p.description}\n💰 *{p.price} руб.*\n❌ Закончился"
            if p.photo_id:
                photo = f"{BACKEND_URL.rstrip('/')}{p.photo_id}" if p.photo_id.startswith("/") else p.photo_id
                await message.answer_photo(photo, caption=caption, reply_markup=d_kb, parse_mode="Markdown")
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
            f"👤 Покупатель ID: `{order.buyer_id}`\n"
            f"🛒 Товары: {format_items_info(order.items_info)}\n"
            f"{price_text}\n"
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
async def accept_order_callback(callback: types.CallbackQuery, state: FSMContext):
    """Принять заказ"""
    order_id = int(callback.data.split("_")[2])
    result = await api_accept_order(order_id)
    
    if result and result.get("status") == "ok":
        # Получаем информацию о заказе для отображения текущей цены
        total_price = result.get("total_price", 0)
        original_price = result.get("original_price", total_price)
        
        # Сохраняем original_price в состояние для дальнейшего использования
        await state.update_data(order_id=order_id, original_price=original_price)
        
        # Обновляем сообщение
        await callback.message.edit_text(
            callback.message.text + "\n\n✅ *ЗАКАЗ ПРИНЯТ*\n\n"
            f"💰 Текущая сумма: *{total_price} руб.*\n\n"
            "Вы можете изменить сумму заказа или оставить текущую.",
            parse_mode="Markdown"
        )
        
        # Показываем кнопки для изменения цены или подтверждения текущей
        kb_price = InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(text="✏️ Изменить сумму", callback_data=f"change_price_{order_id}"),
                InlineKeyboardButton(text="✅ Оставить текущую", callback_data=f"keep_price_{order_id}")
            ]
        ])
        
        await callback.message.edit_reply_markup(reply_markup=kb_price)
        await callback.answer("✅ Заказ принят! Выберите действие с суммой.", show_alert=True)
    else:
        await callback.answer("❌ Ошибка при принятии заказа", show_alert=True)


@router.callback_query(F.data.startswith("keep_price_"))
async def keep_price_callback(callback: types.CallbackQuery, state: FSMContext):
    """Оставить текущую цену заказа"""
    order_id = int(callback.data.split("_")[2])
    
    # Очищаем состояние
    await state.clear()
    
    # Убираем кнопки изменения цены
    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.answer("✅ Сумма заказа оставлена без изменений", show_alert=True)


@router.callback_query(F.data.startswith("change_price_"))
async def change_price_start_callback(callback: types.CallbackQuery, state: FSMContext):
    """Начать процесс изменения цены заказа"""
    order_id = int(callback.data.split("_")[2])
    
    # Получаем данные из состояния или из API
    data = await state.get_data()
    current_price = data.get("original_price", 0)
    
    # Если нет в состоянии, получаем из API
    if not current_price:
        orders = await api_get_seller_orders(callback.from_user.id, status="accepted")
        order = next((o for o in orders if o.id == order_id), None)
        if order:
            current_price = order.total_price
            original_price = order.original_price if hasattr(order, 'original_price') and order.original_price else order.total_price
            await state.update_data(order_id=order_id, original_price=original_price)
        else:
            current_price = 0
    
    # Сохраняем order_id в состояние
    await state.update_data(order_id=order_id)
    await state.set_state(ChangeOrderPrice.waiting_for_price)
    
    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.message.answer(
        f"✏️ *Изменение суммы заказа*\n\n"
        f"💰 Текущая сумма: *{current_price} руб.*\n\n"
        "Введите новую сумму заказа (только число):",
        parse_mode="Markdown",
        reply_markup=kb.cancel_kb
    )
    await callback.answer()


@router.message(ChangeOrderPrice.waiting_for_price)
async def change_price_process(message: types.Message, state: FSMContext):
    """Обработка ввода новой цены"""
    if message.text == "❌ Отмена":
        await state.clear()
        menu = kb.get_main_kb(message.from_user.id, "SELLER")
        await message.answer("Отменено.", reply_markup=menu)
        return
    
    # Проверка ввода
    try:
        new_price = float(message.text.replace(",", "."))
        if new_price < 0:
            return await message.answer("❌ Сумма не может быть отрицательной")
    except ValueError:
        return await message.answer("❌ Введите корректное число (например: 1500 или 1500.50)")
    
    data = await state.get_data()
    order_id = data.get("order_id")
    original_price = data.get("original_price", 0)
    
    # Если цена изменилась, требуем двойное подтверждение
    if abs(new_price - original_price) > 0.01:  # Учитываем погрешность округления
        await state.update_data(new_price=new_price)
        await state.set_state(ChangeOrderPrice.waiting_for_confirm)
        
        confirm_kb = InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Да, изменить", callback_data=f"confirm_price_change_{order_id}"),
                InlineKeyboardButton(text="❌ Отмена", callback_data=f"cancel_price_change_{order_id}")
            ]
        ])
        
        await message.answer(
            f"⚠️ *Подтверждение изменения суммы*\n\n"
            f"💰 Было: *{original_price} руб.*\n"
            f"💰 Станет: *{new_price} руб.*\n\n"
            "Вы уверены, что хотите изменить сумму заказа?\n"
            "Покупатель будет уведомлен об изменении.",
            parse_mode="Markdown",
            reply_markup=confirm_kb
        )
    else:
        # Цена не изменилась, просто подтверждаем
        await state.clear()
        menu = kb.get_main_kb(message.from_user.id, "SELLER")
        await message.answer(
            f"✅ Сумма не изменилась (*{original_price} руб.*). Заказ оставлен без изменений.",
            parse_mode="Markdown",
            reply_markup=menu
        )


@router.callback_query(F.data.startswith("confirm_price_change_"))
async def confirm_price_change_callback(callback: types.CallbackQuery, state: FSMContext):
    """Подтверждение изменения цены (первое подтверждение)"""
    order_id = int(callback.data.split("_")[3])
    data = await state.get_data()
    new_price = data.get("new_price")
    original_price = data.get("original_price", 0)
    
    # Второе подтверждение
    await state.update_data(first_confirm=True)
    
    second_confirm_kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="✅ Да, подтверждаю", callback_data=f"final_confirm_price_{order_id}"),
            InlineKeyboardButton(text="❌ Отмена", callback_data=f"cancel_price_change_{order_id}")
        ]
    ])
    
    await callback.message.edit_text(
        f"⚠️ *Второе подтверждение*\n\n"
        f"💰 Было: *{original_price} руб.*\n"
        f"💰 Станет: *{new_price} руб.*\n\n"
        "Пожалуйста, подтвердите изменение суммы еще раз:",
        parse_mode="Markdown",
        reply_markup=second_confirm_kb
    )
    await callback.answer()


@router.callback_query(F.data.startswith("final_confirm_price_"))
async def final_confirm_price_callback(callback: types.CallbackQuery, state: FSMContext):
    """Финальное подтверждение изменения цены"""
    order_id = int(callback.data.split("_")[3])
    data = await state.get_data()
    new_price = data.get("new_price")
    original_price = data.get("original_price", 0)
    
    # Вызываем API для изменения цены
    result = await api_update_order_price(order_id, new_price)
    
    menu = kb.get_main_kb(callback.from_user.id, "SELLER")
    
    if result and result.get("status") == "ok":
        await callback.message.edit_text(
            f"✅ *Сумма заказа изменена*\n\n"
            f"💰 Было: *{original_price} руб.*\n"
            f"💰 Стало: *{new_price} руб.*\n\n"
            "Покупатель будет уведомлен об изменении суммы.",
            parse_mode="Markdown"
        )
        await callback.message.edit_reply_markup(reply_markup=None)
        await callback.answer("✅ Сумма заказа успешно изменена!", show_alert=True)
    else:
        await callback.message.edit_text(
            callback.message.text + "\n\n❌ *Ошибка при изменении суммы*",
            parse_mode="Markdown"
        )
        await callback.answer("❌ Ошибка при изменении суммы заказа", show_alert=True)
    
    await state.clear()


@router.callback_query(F.data.startswith("cancel_price_change_"))
async def cancel_price_change_callback(callback: types.CallbackQuery, state: FSMContext):
    """Отмена изменения цены"""
    await state.clear()
    menu = kb.get_main_kb(callback.from_user.id, "SELLER")
    await callback.message.edit_text(
        callback.message.text + "\n\n❌ *Изменение суммы отменено*",
        parse_mode="Markdown"
    )
    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.answer("Изменение суммы отменено")


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
            f"👤 Покупатель ID: `{order.buyer_id}`\n"
            f"🛒 Товары: {format_items_info(order.items_info)}\n"
            f"{price_text}\n"
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
    """Настройка дневного лимита. Лимит обнуляется каждый день в 6:00 (МСК)."""
    seller = await api_get_seller(message.from_user.id)
    
    if not seller:
        return await message.answer("❌ Продавец не найден.")
    
    limit_set = getattr(seller, "limit_set_for_today", False)
    current_limit = seller.max_orders or 0
    orders_used = getattr(seller, "orders_used_today", 0)
    free_slots = max(0, current_limit - orders_used) if limit_set else 0
    
    if not limit_set or current_limit <= 0:
        text = (
            "⚙️ *Настройка лимитов*\n"
            "━━━━━━━━━━━━━━━\n"
            "🕕 Лимит обнуляется *каждый день в 6:00* (МСК).\n"
            "После 6:00 укажите, сколько заказов сможете выполнить *сегодня*.\n\n"
            "📊 Лимит на сегодня: *не задан*\n\n"
            "Введите число заказов на сегодня (от 1 до 100):"
        )
    else:
        text = (
            f"⚙️ *Настройка лимитов*\n"
            f"━━━━━━━━━━━━━━━\n"
            f"🕕 Лимит на сегодня: *{current_limit}* заказов\n"
            f"📦 Уже использовано: {orders_used}\n"
            f"📈 Свободно слотов: *{free_slots}*\n\n"
            f"Введите новый лимит на сегодня (от 1 до 100):"
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
        return await message.answer(
            "⛔ Сейчас вы не можете добавлять товары: лимит на сегодня не задан или исчерпан.\n"
            "Укажите лимит в разделе «⚙️ Настройка лимитов» (после 6:00 нужно задать лимит на каждый день)."
        )
    kb_choice = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✏️ Вручную", callback_data="add_product_manual")],
        [InlineKeyboardButton(text="💐 Из букета", callback_data="add_product_from_bouquet")],
    ])
    await message.answer("Как добавить товар?", reply_markup=kb_choice)


@router.callback_query(F.data == "add_product_manual")
async def add_product_manual_cb(callback: types.CallbackQuery, state: FSMContext):
    await state.set_state(AddProduct.name)
    await callback.message.answer("Введите название товара:", reply_markup=kb.cancel_kb)
    await callback.answer()


@router.callback_query(F.data == "add_product_from_bouquet")
async def add_product_from_bouquet_cb(callback: types.CallbackQuery, state: FSMContext):
    bouquets = await api_get_bouquets(callback.from_user.id)
    if not bouquets:
        await callback.answer("Нет букетов. Создайте букет в веб-панели (Конструктор букетов).", show_alert=True)
        return
    await state.update_data(bouquets_list=bouquets)
    rows = []
    for b in bouquets[:20]:
        name = (b.get("name") or "Букет")[:30]
        price = b.get("total_price")
        pr = f" — {price:.0f} ₽" if price is not None else ""
        rows.append([InlineKeyboardButton(text=f"{name}{pr}", callback_data=f"add_bouquet_sel_{b.get('id')}")])
    kb_b = InlineKeyboardMarkup(inline_keyboard=rows)
    await callback.message.edit_text("Выберите букет:")
    await callback.message.edit_reply_markup(reply_markup=kb_b)
    await callback.answer()


@router.callback_query(F.data.startswith("add_bouquet_sel_"))
async def add_bouquet_select_cb(callback: types.CallbackQuery, state: FSMContext):
    bouquet_id = int(callback.data.split("_")[3])
    data = await state.get_data()
    bouquets_list = data.get("bouquets_list") or []
    chosen = next((b for b in bouquets_list if b.get("id") == bouquet_id), None)
    if not chosen:
        await callback.answer("Букет не найден.", show_alert=True)
        return
    # Количество автоматически по остаткам в приёмке (сколько таких букетов можно собрать)
    quantity = max(0, int(chosen.get("can_assemble_count") or 0))
    await state.update_data(
        bouquet_id=bouquet_id,
        name=chosen.get("name") or "Букет",
        price=chosen.get("total_price") or 0,
        description="",
        quantity=quantity,
    )
    await state.set_state(AddProduct.photo)
    await callback.message.answer(
        f"Количество установлено автоматически по остаткам в приёмке: *{quantity}* шт.\n\n"
        "Отправьте фото товара:",
        reply_markup=kb.cancel_kb,
        parse_mode="Markdown",
    )
    await callback.answer()

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
    if message.text == "❌ Отмена":
        await state.clear()
        menu = kb.get_main_kb(message.from_user.id, "SELLER")
        await message.answer("Отменено.", reply_markup=menu)
        return
    if not message.text.isdigit(): return await message.answer("Только цифры!")
    await state.update_data(price=float(message.text))
    await state.set_state(AddProduct.quantity)
    await message.answer("Количество товара (сколько штук доступно):", reply_markup=kb.cancel_kb)

@router.message(AddProduct.quantity)
async def add_p_quantity(message: types.Message, state: FSMContext):
    if message.text == "❌ Отмена":
        await state.clear()
        menu = kb.get_main_kb(message.from_user.id, "SELLER")
        await message.answer("Отменено.", reply_markup=menu)
        return
    if not message.text.isdigit(): return await message.answer("Только цифры!")
    quantity = int(message.text)
    if quantity < 0: return await message.answer("Количество не может быть отрицательным!")
    await state.update_data(quantity=quantity)
    await state.set_state(AddProduct.photo)
    await message.answer("Отправьте фото товара:", reply_markup=kb.cancel_kb)

@router.message(AddProduct.photo, F.text)
async def add_p_photo_cancel(message: types.Message, state: FSMContext):
    if message.text == "❌ Отмена":
        await state.clear()
        menu = kb.get_main_kb(message.from_user.id, "SELLER")
        await message.answer("Отменено.", reply_markup=menu)
    else:
        await message.answer("Отправьте фото товара (или нажмите «❌ Отмена»).")

@router.message(AddProduct.photo, F.photo)
async def add_p_photo(message: types.Message, state: FSMContext):
    photo_id = message.photo[-1].file_id
    data = await state.get_data()
    await message.answer("⏳ Сохраняю...")
    quantity = data.get("quantity", 0)
    bouquet_id = data.get("bouquet_id")
    res = await api_create_product(
        message.from_user.id,
        data["name"],
        data["price"],
        data.get("description") or "",
        photo_id,
        quantity,
        bouquet_id=bouquet_id,
    )
    menu = kb.get_main_kb(message.from_user.id, "SELLER")
    if res:
        await message.answer(f"✅ Товар «{data['name']}» добавлен! Количество: {quantity} шт.", reply_markup=menu)
    else:
        await message.answer("❌ Ошибка сохранения.", reply_markup=menu)
    await state.clear()

# --- 5. ВЫХОД (Переходы по кнопкам) ---
@router.message(F.text == "🛍 Режим покупателя")
async def to_buy(message: types.Message):
    menu = kb.get_main_kb(message.from_user.id, "BUYER")
    await message.answer("Меню покупателя.", reply_markup=menu)