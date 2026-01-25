from aiogram import Router, F, types
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from datetime import datetime
import bot.keyboards.reply as kb
from bot.api_client.sellers import (
    api_create_seller,
    api_search_sellers, api_update_seller_field,
    api_block_seller, api_delete_seller,
    api_get_all_stats, api_get_seller_stats, api_get_agents_stats,
    api_get_all_sellers
)

router = Router()

# --- ОБЩАЯ ОТМЕНА (если пришло сообщение "❌ Отмена") ---
@router.message(F.text == "❌ Отмена")
async def cancel_any_message(message: types.Message, state: FSMContext):
    await state.clear()
    await message.answer("Отменено.", reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN"))

# --- FSM ДЛЯ ДОБАВЛЕНИЯ ПРОДАВЦА ---
class AddSeller(StatesGroup):
    fio = State()
    tg_id = State()
    phone = State()
    shop_name = State()
    description = State()
    city = State()
    district = State()
    map_url = State()
    delivery_type = State()
    placement_expired_at = State()

# --- FSM ДЛЯ ИЗМЕНЕНИЯ ДАННЫХ ---
class EditSeller(StatesGroup):
    search_fio = State()
    select_seller = State()
    select_field = State()
    enter_value = State()

# --- FSM ДЛЯ БЛОКИРОВКИ/УДАЛЕНИЯ ---
class ManageSeller(StatesGroup):
    search_fio = State()
    select_seller = State()
    select_action = State()

# --- FSM ДЛЯ СТАТИСТИКИ ---
class StatsSeller(StatesGroup):
    search_fio = State()

# ============================================
# 1. ДОБАВЛЕНИЕ ПРОДАВЦА (FSM AddSeller)
# ============================================

@router.message(F.text == "➕ Добавить продавца")
async def start_add_seller(message: types.Message, state: FSMContext):
    await state.set_state(AddSeller.fio)
    await message.answer("👤 Введите ФИО продавца:", reply_markup=kb.cancel_kb)

@router.message(AddSeller.fio)
async def add_fio(message: types.Message, state: FSMContext):
    if message.text == "❌ Отмена":
        await state.clear()
        await message.answer("Отменено.", reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN"))
        return
    
    await state.update_data(fio=message.text)
    await state.set_state(AddSeller.tg_id)
    await message.answer("🆔 Введите Telegram ID продавца (цифрами):")

@router.message(AddSeller.tg_id)
async def add_tg_id(message: types.Message, state: FSMContext):
    if message.text == "❌ Отмена":
        await state.clear()
        await message.answer("Отменено.", reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN"))
        return
    
    if not message.text.isdigit():
        return await message.answer("❌ Введите только цифры!")
    
    await state.update_data(tg_id=int(message.text))
    await state.set_state(AddSeller.phone)
    await message.answer("📞 Введите телефон для связи с покупателем:")

@router.message(AddSeller.phone)
async def add_phone(message: types.Message, state: FSMContext):
    if message.text == "❌ Отмена":
        await state.clear()
        await message.answer("Отменено.", reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN"))
        return
    
    await state.update_data(phone=message.text)
    await state.set_state(AddSeller.shop_name)
    await message.answer("🏪 Введите название магазина:")

@router.message(AddSeller.shop_name)
async def add_shop_name(message: types.Message, state: FSMContext):
    if message.text == "❌ Отмена":
        await state.clear()
        await message.answer("Отменено.", reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN"))
        return
    
    await state.update_data(shop_name=message.text)
    await state.set_state(AddSeller.description)
    await message.answer("📝 Введите информацию об организации:")

@router.message(AddSeller.description)
async def add_description(message: types.Message, state: FSMContext):
    if message.text == "❌ Отмена":
        await state.clear()
        await message.answer("Отменено.", reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN"))
        return
    
    await state.update_data(description=message.text)
    await state.set_state(AddSeller.city)
    
    # Пока только Москва
    keyboard = [
        [InlineKeyboardButton(text="Москва", callback_data="city_1")],
        [InlineKeyboardButton(text="❌ Отмена", callback_data="cancel")]
    ]
    await message.answer("🏙 Выберите город:", reply_markup=InlineKeyboardMarkup(inline_keyboard=keyboard))

@router.callback_query(AddSeller.city)
async def select_city(callback: types.CallbackQuery, state: FSMContext):
    # Отмена должна обрабатываться первой
    if callback.data == "cancel":
        await callback.answer()
        await state.clear()
        await callback.message.edit_text("Отменено.")
        await callback.message.answer("Главное меню.", reply_markup=kb.get_main_kb(callback.from_user.id, "ADMIN"))
        return
    
    if not callback.data or not callback.data.startswith("city_"):
        return
    
    city_id = int(callback.data.split("_")[1])
    await state.update_data(city_id=city_id)
    await state.set_state(AddSeller.district)
    
    # 12 округов Москвы
    districts = [
        (1, "ЦАО"),
        (2, "САО"),
        (3, "СВАО"),
        (4, "ВАО"),
        (5, "ЮВАО"),
        (6, "ЮАО"),
        (7, "ЮЗАО"),
        (8, "ЗАО"),
        (9, "СЗАО"),
        (10, "Зеленоградский"),
        (11, "Новомосковский"),
        (12, "Троицкий"),
    ]
    keyboard = []
    for d_id, name in districts:
        keyboard.append([InlineKeyboardButton(text=name, callback_data=f"district_{d_id}")])
    keyboard.append([InlineKeyboardButton(text="❌ Отмена", callback_data="cancel")])
    
    await callback.message.edit_text("📍 Выберите округ Москвы:", reply_markup=InlineKeyboardMarkup(inline_keyboard=keyboard))

@router.callback_query(AddSeller.district)
async def select_district(callback: types.CallbackQuery, state: FSMContext):
    # Обрабатываем отмену ПЕРВЫМ делом, до всех проверок
    if callback.data == "cancel":
        await callback.answer()
        await state.clear()
        await callback.message.edit_text("Отменено.")
        await callback.message.answer("Главное меню.", reply_markup=kb.get_main_kb(callback.from_user.id, "ADMIN"))
        return
    
    if not callback.data or not callback.data.startswith("district_"):
        return
    
    district_id = int(callback.data.split("_")[1])
    await state.update_data(district_id=district_id)
    await state.set_state(AddSeller.map_url)
    await callback.message.edit_text("🗺 Введите адрес (ссылка Яндекс.Карты):")

@router.message(AddSeller.map_url)
async def add_map_url(message: types.Message, state: FSMContext):
    if message.text == "❌ Отмена":
        await state.clear()
        await message.answer("Отменено.", reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN"))
        return
    
    await state.update_data(map_url=message.text)
    await state.set_state(AddSeller.delivery_type)
    
    # Кнопки для выбора типа доставки
    del_kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🚚 Только самовывоз", callback_data="deliv_pickup")],
        [InlineKeyboardButton(text="🚚 Доставка", callback_data="deliv_delivery")],
        [InlineKeyboardButton(text="🚚 Оба", callback_data="deliv_both")],
        [InlineKeyboardButton(text="❌ Отмена", callback_data="cancel")]
    ])
    await message.answer("🚚 Выберите тип доставки:", reply_markup=del_kb)

@router.callback_query(AddSeller.delivery_type)
async def select_delivery_type(callback: types.CallbackQuery, state: FSMContext):
    # Обрабатываем отмену ПЕРВЫМ делом
    if callback.data == "cancel":
        await callback.answer()
        await state.clear()
        await callback.message.edit_text("Отменено.")
        await callback.message.answer("Главное меню.", reply_markup=kb.get_main_kb(callback.from_user.id, "ADMIN"))
        return
    
    if not callback.data or not callback.data.startswith("deliv_"):
        return
    
    delivery_type = callback.data.split("_")[1]
    await state.update_data(delivery_type=delivery_type)
    await state.set_state(AddSeller.placement_expired_at)
    await callback.message.edit_text("📅 Введите дату окончания размещения (формат: ДД.ММ.ГГГГ или оставьте пустым):")

@router.message(AddSeller.placement_expired_at)
async def add_expiry_date(message: types.Message, state: FSMContext):
    if message.text == "❌ Отмена":
        await state.clear()
        await message.answer("Отменено.", reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN"))
        return
    
    placement_expired_at = None
    if message.text and message.text.strip():
        try:
            # Парсим дату в формате ДД.ММ.ГГГГ
            placement_expired_at = datetime.strptime(message.text.strip(), "%d.%m.%Y").isoformat()
        except ValueError:
            await message.answer("❌ Неверный формат даты! Используйте ДД.ММ.ГГГГ или оставьте пустым.")
            return
    
    data = await state.get_data()
    
    # Вызываем API для создания продавца
    resp = await api_create_seller(
        tg_id=data['tg_id'],
        fio=data['fio'],
        phone=data['phone'],
        shop_name=data['shop_name'],
        description=data.get('description'),
        city_id=data.get('city_id'),
        district_id=data.get('district_id'),
        map_url=data.get('map_url'),
        delivery_type=data.get('delivery_type'),
        placement_expired_at=placement_expired_at
    )

    if resp and resp.get("status") == "ok":
        await message.answer(
            f"✅ Продавец {data['shop_name']} успешно добавлен!\n"
            f"📝 ФИО: {data['fio']}\n"
            f"🆔 Telegram ID: {data['tg_id']}\n"
            f"📞 Телефон: {data['phone']}\n\n"
            f"⚠️ Продавец скрыт до установки лимита заказов.",
            reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN")
        )
    elif resp and resp.get("status") == "exists":
        await message.answer(
            "❌ Продавец с таким Telegram ID уже существует.",
            reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN")
        )
    else:
        await message.answer(
            "❌ Ошибка создания продавца. Проверьте данные и попробуйте снова.",
            reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN")
        )
    
    await state.clear()

# ============================================
# 2. ИЗМЕНЕНИЕ ДАННЫХ
# ============================================

@router.message(F.text == "📝 Изменить данные")
async def start_edit_seller(message: types.Message, state: FSMContext):
    await state.set_state(EditSeller.search_fio)
    await message.answer("🔍 Введите ФИО продавца для поиска:", reply_markup=kb.cancel_kb)

@router.message(EditSeller.search_fio)
async def search_seller_for_edit(message: types.Message, state: FSMContext):
    if message.text == "❌ Отмена":
        await state.clear()
        await message.answer("Отменено.", reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN"))
        return
    
    sellers = await api_search_sellers(message.text)
    if not sellers or len(sellers) == 0:
        await message.answer("❌ Продавцы не найдены.")
        await state.clear()
        return
    
    await state.update_data(search_fio=message.text)
    await state.set_state(EditSeller.select_seller)
    
    # Если один продавец - сразу выбираем его
    if len(sellers) == 1:
        await state.update_data(selected_tg_id=sellers[0]['tg_id'])
        await state.update_data(selected_fio=sellers[0]['fio'])
        await state.set_state(EditSeller.select_field)
        
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="👤 ФИО", callback_data="field_fio")],
            [InlineKeyboardButton(text="📞 Телефон", callback_data="field_phone")],
            [InlineKeyboardButton(text="🏪 Название магазина", callback_data="field_shop_name")],
            [InlineKeyboardButton(text="📝 Описание", callback_data="field_description")],
            [InlineKeyboardButton(text="🗺 Адрес (Яндекс.Карты)", callback_data="field_map_url")],
            [InlineKeyboardButton(text="🚚 Тип доставки", callback_data="field_delivery_type")],
            [InlineKeyboardButton(text="❌ Отмена", callback_data="cancel")]
        ])
        await message.answer(
            f"✅ Найден продавец: {sellers[0]['fio']}\n"
            f"Выберите поле для изменения:",
            reply_markup=keyboard
        )
    else:
        # Несколько продавцов - выбираем
        keyboard = []
        for seller in sellers:
            keyboard.append([InlineKeyboardButton(
                text=f"{seller['fio']} - {seller['shop_name']}",
                callback_data=f"seller_{seller['tg_id']}"
            )])
        keyboard.append([InlineKeyboardButton(text="❌ Отмена", callback_data="cancel")])
        
        await message.answer(
            "Найдено несколько продавцов. Выберите нужного:",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=keyboard)
        )

@router.callback_query(EditSeller.select_seller)
async def select_seller_for_edit(callback: types.CallbackQuery, state: FSMContext):
    # Обрабатываем отмену ПЕРВЫМ делом
    if callback.data == "cancel":
        await callback.answer()
        await state.clear()
        await callback.message.edit_text("Отменено.")
        await callback.message.answer("Главное меню.", reply_markup=kb.get_main_kb(callback.from_user.id, "ADMIN"))
        return
    
    if not callback.data or not callback.data.startswith("seller_"):
        return
    
    tg_id = int(callback.data.split("_")[1])
    await state.update_data(selected_tg_id=tg_id)
    await state.set_state(EditSeller.select_field)
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="👤 ФИО", callback_data="field_fio")],
        [InlineKeyboardButton(text="📞 Телефон", callback_data="field_phone")],
        [InlineKeyboardButton(text="🏪 Название магазина", callback_data="field_shop_name")],
        [InlineKeyboardButton(text="📝 Описание", callback_data="field_description")],
        [InlineKeyboardButton(text="🗺 Адрес (Яндекс.Карты)", callback_data="field_map_url")],
        [InlineKeyboardButton(text="🚚 Тип доставки", callback_data="field_delivery_type")],
        [InlineKeyboardButton(text="❌ Отмена", callback_data="cancel")]
    ])
    await callback.message.edit_text("Выберите поле для изменения:", reply_markup=keyboard)

@router.callback_query(EditSeller.select_field)
async def select_field_to_edit(callback: types.CallbackQuery, state: FSMContext):
    # Обрабатываем отмену ПЕРВЫМ делом
    if callback.data == "cancel":
        await callback.answer()
        await state.clear()
        await callback.message.edit_text("Отменено.")
        await callback.message.answer("Главное меню.", reply_markup=kb.get_main_kb(callback.from_user.id, "ADMIN"))
        return
    
    if not callback.data or not callback.data.startswith("field_"):
        return
    
    field = callback.data.split("field_", 1)[1]
    field_names = {
        "fio": "ФИО",
        "phone": "Телефон",
        "shop_name": "Название магазина",
        "description": "Описание",
        "map_url": "Адрес (Яндекс.Карты)",
        "delivery_type": "Тип доставки"
    }
    
    await state.update_data(selected_field=field)
    await state.set_state(EditSeller.enter_value)
    
    if field == "delivery_type":
        # Для типа доставки показываем кнопки
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🚚 Только самовывоз", callback_data="value_pickup")],
            [InlineKeyboardButton(text="🚚 Доставка", callback_data="value_delivery")],
            [InlineKeyboardButton(text="🚚 Оба", callback_data="value_both")],
            [InlineKeyboardButton(text="❌ Отмена", callback_data="cancel")]
        ])
        await callback.message.edit_text(
            f"Выберите новый тип доставки:",
            reply_markup=keyboard
        )
    else:
        await callback.message.edit_text(
            f"Введите новое значение для поля '{field_names[field]}':",
            reply_markup=None
        )

@router.callback_query(EditSeller.enter_value)
async def set_delivery_type_value(callback: types.CallbackQuery, state: FSMContext):
    # Обрабатываем отмену ПЕРВЫМ делом
    if callback.data == "cancel":
        await callback.answer()
        await state.clear()
        await callback.message.edit_text("Отменено.")
        await callback.message.answer("Главное меню.", reply_markup=kb.get_main_kb(callback.from_user.id, "ADMIN"))
        return
    
    if not callback.data or not callback.data.startswith("value_"):
        return
    
    value = callback.data.split("_")[1]
    data = await state.get_data()
    
    success = await api_update_seller_field(data['selected_tg_id'], "delivery_type", value)
    
    if success:
        await callback.message.edit_text("✅ Поле успешно обновлено!")
    else:
        await callback.message.edit_text("❌ Ошибка при обновлении.")
    
    await callback.message.answer("Главное меню.", reply_markup=kb.get_main_kb(callback.from_user.id, "ADMIN"))
    await state.clear()

@router.message(EditSeller.enter_value)
async def enter_new_value(message: types.Message, state: FSMContext):
    if message.text == "❌ Отмена":
        await state.clear()
        await message.answer("Отменено.", reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN"))
        return
    
    data = await state.get_data()
    success = await api_update_seller_field(data['selected_tg_id'], data['selected_field'], message.text)
    
    if success:
        await message.answer("✅ Поле успешно обновлено!", reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN"))
    else:
        await message.answer("❌ Ошибка при обновлении.", reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN"))
    
    await state.clear()

# ============================================
# 3. БЛОКИРОВКА/УДАЛЕНИЕ
# ============================================

@router.message(F.text == "⚙️ Управление продавцами")
async def start_manage_seller(message: types.Message, state: FSMContext):
    await state.set_state(ManageSeller.search_fio)
    await message.answer("🔍 Введите ФИО продавца для поиска:", reply_markup=kb.cancel_kb)

@router.message(ManageSeller.search_fio)
async def search_seller_for_manage(message: types.Message, state: FSMContext):
    if message.text == "❌ Отмена":
        await state.clear()
        await message.answer("Отменено.", reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN"))
        return
    
    sellers = await api_search_sellers(message.text)
    if not sellers or len(sellers) == 0:
        await message.answer("❌ Продавцы не найдены.")
        await state.clear()
        return
    
    await state.update_data(search_fio=message.text)
    await state.set_state(ManageSeller.select_seller)
    
    # Если один продавец - сразу выбираем его
    if len(sellers) == 1:
        await state.update_data(selected_tg_id=sellers[0]['tg_id'])
        await state.update_data(selected_fio=sellers[0]['fio'])
        await state.update_data(is_blocked=sellers[0]['is_blocked'])
        await state.set_state(ManageSeller.select_action)
        
        blocked_text = "🔴 Заблокирован" if sellers[0]['is_blocked'] else "🟢 Активен"
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(
                text="🔴 Заблокировать" if not sellers[0]['is_blocked'] else "🟢 Разблокировать",
                callback_data="block_toggle"
            )],
            [InlineKeyboardButton(text="🗑 Удалить (Hard Delete)", callback_data="admin_delete_hard")],
            [InlineKeyboardButton(text="❌ Отмена", callback_data="cancel")]
        ])
        await message.answer(
            f"✅ Найден продавец: {sellers[0]['fio']}\n"
            f"Статус: {blocked_text}\n"
            f"Выберите действие:",
            reply_markup=keyboard
        )
    else:
        # Несколько продавцов - выбираем
        keyboard = []
        for seller in sellers:
            status = "🔴" if seller['is_blocked'] else "🟢"
            keyboard.append([InlineKeyboardButton(
                text=f"{status} {seller['fio']} - {seller['shop_name']}",
                callback_data=f"seller_{seller['tg_id']}"
            )])
        keyboard.append([InlineKeyboardButton(text="❌ Отмена", callback_data="cancel")])
        
        await message.answer(
            "Найдено несколько продавцов. Выберите нужного:",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=keyboard)
        )

@router.callback_query(ManageSeller.select_seller)
async def select_seller_for_manage(callback: types.CallbackQuery, state: FSMContext):
    # Обрабатываем отмену ПЕРВЫМ делом
    if callback.data == "cancel":
        await callback.answer()
        await state.clear()
        await callback.message.edit_text("Отменено.")
        await callback.message.answer("Главное меню.", reply_markup=kb.get_main_kb(callback.from_user.id, "ADMIN"))
        return
    
    if not callback.data or not callback.data.startswith("seller_"):
        return
    
    tg_id = int(callback.data.split("_")[1])
    # Находим продавца в списке
    data = await state.get_data()
    sellers = await api_search_sellers(data['search_fio'])
    seller = next((s for s in sellers if s['tg_id'] == tg_id), None)
    
    if not seller:
        await callback.message.edit_text("❌ Продавец не найден.")
        await state.clear()
        return
    
    await state.update_data(selected_tg_id=tg_id)
    await state.update_data(selected_fio=seller['fio'])
    await state.update_data(is_blocked=seller['is_blocked'])
    await state.set_state(ManageSeller.select_action)
    
    blocked_text = "🔴 Заблокирован" if seller['is_blocked'] else "🟢 Активен"
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="🔴 Заблокировать" if not seller['is_blocked'] else "🟢 Разблокировать",
            callback_data="block_toggle"
        )],
        [InlineKeyboardButton(text="🗑 Удалить (Hard Delete)", callback_data="admin_delete_hard")],
        [InlineKeyboardButton(text="❌ Отмена", callback_data="cancel")]
    ])
    await callback.message.edit_text(
        f"✅ Продавец: {seller['fio']}\n"
        f"Статус: {blocked_text}\n"
        f"Выберите действие:",
        reply_markup=keyboard
    )

@router.callback_query(ManageSeller.select_action)
async def execute_manage_action(callback: types.CallbackQuery, state: FSMContext):
    # Обрабатываем отмену ПЕРВЫМ делом
    if callback.data == "cancel":
        await callback.answer()
        await state.clear()
        await callback.message.edit_text("Отменено.")
        await callback.message.answer("Главное меню.", reply_markup=kb.get_main_kb(callback.from_user.id, "ADMIN"))
        return
    
    data = await state.get_data()
    tg_id = data['selected_tg_id']
    
    if callback.data == "block_toggle":
        # Переключаем блокировку
        new_status = not data['is_blocked']
        success = await api_block_seller(tg_id, new_status)
        
        if success:
            status_text = "заблокирован" if new_status else "разблокирован"
            await callback.message.edit_text(f"✅ Продавец {status_text}!")
        else:
            await callback.message.edit_text("❌ Ошибка при изменении статуса.")
        
        await callback.message.answer("Главное меню.", reply_markup=kb.get_main_kb(callback.from_user.id, "ADMIN"))
        await state.clear()
    
    elif callback.data == "admin_delete_hard":
        # Подтверждение удаления
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="✅ Да, удалить", callback_data="admin_confirm_delete")],
            [InlineKeyboardButton(text="❌ Отмена", callback_data="cancel")]
        ])
        await callback.message.edit_text(
            "⚠️ ВНИМАНИЕ! Это Hard Delete - продавец будет удален из БД.\n"
            "История заказов сохранится.\n\n"
            "Подтвердите удаление:",
            reply_markup=keyboard
        )
        # Не очищаем state, остаемся в том же состоянии для подтверждения
    
    elif callback.data == "admin_confirm_delete":
        # Обрабатываем подтверждение удаления
        success = await api_delete_seller(tg_id)
        
        if success:
            await callback.message.edit_text("✅ Продавец удален из БД!")
        else:
            await callback.message.edit_text("❌ Ошибка при удалении.")
        
        await callback.message.answer("Главное меню.", reply_markup=kb.get_main_kb(callback.from_user.id, "ADMIN"))
        await state.clear()

# ============================================
# 4. СТАТИСТИКА
# ============================================

@router.message(F.text == "📊 Статистика")
async def show_stats_menu(message: types.Message):
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📊 Общая статистика", callback_data="stats_all")],
        [InlineKeyboardButton(text="🔍 Статистика по продавцу", callback_data="stats_seller")],
        [InlineKeyboardButton(text="🤝 Статистика по агентам", callback_data="stats_agents")],
        [InlineKeyboardButton(text="❌ Отмена", callback_data="cancel")]
    ])
    await message.answer("Выберите тип статистики:", reply_markup=keyboard)

@router.callback_query(F.data == "stats_all")
async def show_all_stats(callback: types.CallbackQuery):
    stats = await api_get_all_stats()
    
    if not stats or len(stats) == 0:
        await callback.message.edit_text("📊 Статистика пуста.")
        return
    
    # Формируем таблицу
    text = "📊 **ОБЩАЯ СТАТИСТИКА ПРОДАВЦОВ**\n\n"
    text += "| ФИО | Заказов | Продажи | Доход 18% |\n"
    text += "|-----|---------|---------|----------|\n"
    
    for stat in stats:
        text += f"| {stat['fio']} | {stat['orders_count']} | {stat['total_sales']:.2f} ₽ | {stat['platform_profit']:.2f} ₽ |\n"
    
    total_sales = sum(s['total_sales'] for s in stats)
    total_profit = sum(s['platform_profit'] for s in stats)
    total_orders = sum(s['orders_count'] for s in stats)
    
    text += f"\n**ИТОГО:**\n"
    text += f"Заказов: {total_orders}\n"
    text += f"Продажи: {total_sales:.2f} ₽\n"
    text += f"Доход платформы: {total_profit:.2f} ₽"
    
    await callback.message.edit_text(text, parse_mode="Markdown")
    await callback.message.answer("Главное меню.", reply_markup=kb.get_main_kb(callback.from_user.id, "ADMIN"))

# ============================================
# 5. СПИСОК ПРОДАВЦОВ
# ============================================

@router.message(F.text == "📋 Список продавцов")
async def show_sellers_list(message: types.Message):
    sellers = await api_get_all_sellers()
    if not sellers:
        await message.answer("❌ Список продавцов пуст.", reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN"))
        return
    
    text_lines = ["📋 **СПИСОК ПРОДАВЦОВ**\n"]
    for seller in sellers:
        text_lines.append(
            f"• {seller.get('fio', '—')} | ID: {seller.get('tg_id')} | Магазин: {seller.get('shop_name', '—')}"
        )
    text = "\n".join(text_lines)
    await message.answer(text, parse_mode="Markdown", reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN"))

@router.callback_query(F.data == "stats_seller")
async def start_stats_seller_search(callback: types.CallbackQuery, state: FSMContext):
    await state.set_state(StatsSeller.search_fio)
    await callback.message.edit_text("🔍 Введите ФИО продавца для получения статистики:")
    await callback.message.answer("(Или отправьте ❌ Отмена для возврата)", reply_markup=kb.cancel_kb)

@router.message(StatsSeller.search_fio)
async def show_seller_stats(message: types.Message, state: FSMContext):
    if message.text == "❌ Отмена":
        await state.clear()
        await message.answer("Отменено.", reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN"))
        return
    
    stats = await api_get_seller_stats(message.text)
    
    if not stats:
        await message.answer("❌ Статистика не найдена для данного продавца.")
        await state.clear()
        return
    
    text = f"📊 **СТАТИСТИКА ПРОДАВЦА**\n\n"
    text += f"👤 ФИО: {stats['fio']}\n"
    text += f"📦 Выполненных заказов: {stats['orders_count']}\n"
    text += f"💰 Сумма продаж: {stats['total_sales']:.2f} ₽\n"
    text += f"💵 Доход платформы (18%): {stats['platform_profit']:.2f} ₽"
    
    await message.answer(text, parse_mode="Markdown", reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN"))
    await state.clear()

@router.callback_query(F.data == "stats_agents")
async def show_agents_stats(callback: types.CallbackQuery):
    stats = await api_get_agents_stats()
    
    if not stats or len(stats) == 0:
        await callback.message.edit_text("📊 Статистика по агентам пуста.")
        return
    
    text = "🤝 **СТАТИСТИКА ПО АГЕНТАМ**\n\n"
    text += "| ФИО | Заказов | Оборот |\n"
    text += "|-----|---------|--------|\n"
    
    for stat in stats:
        text += f"| {stat['fio']} | {stat['orders_count']} | {stat['total_sales']:.2f} ₽ |\n"
    
    total_sales = sum(s['total_sales'] for s in stats)
    total_orders = sum(s['orders_count'] for s in stats)
    
    text += f"\n**ИТОГО:**\n"
    text += f"Заказов: {total_orders}\n"
    text += f"Оборот: {total_sales:.2f} ₽"
    
    await callback.message.edit_text(text, parse_mode="Markdown")
    await callback.message.answer("Главное меню.", reply_markup=kb.get_main_kb(callback.from_user.id, "ADMIN"))

@router.callback_query(F.data == "cancel")
async def cancel_action(callback: types.CallbackQuery, state: FSMContext):
    await callback.answer()
    await state.clear()
    await callback.message.edit_text("Отменено.")
    await callback.message.answer("Главное меню.", reply_markup=kb.get_main_kb(callback.from_user.id, "ADMIN"))

# --- ВЫХОД ---
@router.message(F.text == "👑 Вернуться в АДМИН-ПАНЕЛЬ")
async def back_to_admin_handler(message: types.Message, state: FSMContext):
    await state.clear()
    await message.answer("Вы в главном меню админа.", reply_markup=kb.get_main_kb(message.from_user.id, "ADMIN"))
