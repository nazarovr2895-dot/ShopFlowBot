from aiogram import Router, F, types
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
import bot.keyboards.reply as kb
from bot.api_client.buyers import api_get_user
from bot.api_client.agents import api_get_agent_stats, api_register_agent_data

router = Router()

# FSM: Анкета
class AgentRegister(StatesGroup):
    fio = State()
    age = State()
    phone = State()
    self_employed = State()

# --- 1. ВХОД В РЕЖИМ ---
@router.message(F.text.in_({"🤝 Режим посредника", "🔁 Режим посредника"}))
async def enter_agent_mode(message: types.Message, state: FSMContext):
    user_id = message.from_user.id
    user = await api_get_user(user_id)
    
    if not user:
        return await message.answer("Ошибка связи с сервером.")

    # Если уже агент — показываем меню
    if user.role == 'AGENT':
        menu = kb.get_main_kb(user_id, "AGENT")
        await message.answer("🤝 Кабинет посредника открыт.", reply_markup=menu)
        return

    # Если нет — начинаем регистрацию
    await message.answer(
        "👋 Вы еще не являетесь нашим партнером.\n"
        "Чтобы зарабатывать 7% с продаж, заполните анкету.\n\n"
        "1. Введите ваше **ФИО**:",
        reply_markup=kb.cancel_kb
    )
    await state.set_state(AgentRegister.fio)

# --- 2. ОБРАБОТКА ШАГОВ (Везде добавлена проверка отмены) ---

# Шаг 1: ФИО -> Возраст
@router.message(AgentRegister.fio)
async def process_fio(message: types.Message, state: FSMContext):
    # 👇 ПРОВЕРКА ОТМЕНЫ
    if message.text == "❌ Отмена":
        await state.clear()
        menu = kb.get_main_kb(message.from_user.id, "BUYER")
        await message.answer("Регистрация отменена.", reply_markup=menu)
        return

    await state.update_data(fio=message.text)
    await message.answer("2. Введите ваш **возраст** (числом):", reply_markup=kb.cancel_kb)
    await state.set_state(AgentRegister.age)

# Шаг 2: Возраст -> Телефон
@router.message(AgentRegister.age)
async def process_age(message: types.Message, state: FSMContext):
    # 👇 ПРОВЕРКА ОТМЕНЫ (Важно! Раньше тут была ошибка)
    if message.text == "❌ Отмена":
        await state.clear()
        menu = kb.get_main_kb(message.from_user.id, "BUYER")
        await message.answer("Регистрация отменена.", reply_markup=menu)
        return

    if not message.text.isdigit():
        await message.answer("Пожалуйста, введите возраст числом (например, 25).")
        return
        
    await state.update_data(age=int(message.text))
    await message.answer("3. Введите ваш **номер телефона**:", reply_markup=kb.cancel_kb)
    await state.set_state(AgentRegister.phone)

# Шаг 3: Телефон -> Самозанятость
@router.message(AgentRegister.phone)
async def process_phone(message: types.Message, state: FSMContext):
    # 👇 ПРОВЕРКА ОТМЕНЫ
    if message.text == "❌ Отмена":
        await state.clear()
        menu = kb.get_main_kb(message.from_user.id, "BUYER")
        await message.answer("Регистрация отменена.", reply_markup=menu)
        return

    await state.update_data(phone=message.text)
    
    # Спрашиваем про самозанятость
    await message.answer(
        "4. Вы оформлены как **самозанятый**?",
        reply_markup=kb.yes_no_kb
    )
    await state.set_state(AgentRegister.self_employed)

# Шаг 4: Финал
@router.message(AgentRegister.self_employed)
async def process_self_employed(message: types.Message, state: FSMContext):
    text = message.text.lower()
    
    # 👇 ПРОВЕРКА ОТМЕНЫ
    if "отмена" in text:
        await state.clear()
        menu = kb.get_main_kb(message.from_user.id, "BUYER")
        await message.answer("Регистрация отменена.", reply_markup=menu)
        return

    # Распознаем ответ
    is_self = False
    if "да" in text:
        is_self = True
    elif "нет" in text:
        is_self = False
    else:
        await message.answer("Нажмите кнопку 'Да' или 'Нет'.")
        return

    # Сохраняем
    data = await state.get_data()
    res = await api_register_agent_data(
        tg_id=message.from_user.id,
        fio=data['fio'],
        phone=data['phone'],
        age=data['age'],
        is_self_employed=is_self
    )
    
    if res:
        await state.clear()
        menu = kb.get_main_kb(message.from_user.id, "AGENT")
        await message.answer("✅ Поздравляем! Вы стали партнером.", reply_markup=menu)
    else:
        await message.answer("Ошибка сохранения данных. Попробуйте позже.")


# --- 3. МЕНЮ АГЕНТА ---

@router.message(F.text == "🔗 Реферальная ссылка")
async def show_ref_link(message: types.Message):
    bot_info = await message.bot.get_me()
    link = f"https://t.me/{bot_info.username}?start=agent_{message.from_user.id}"
    await message.answer(f"🔗 **Ваша ссылка:**\n`{link}`", parse_mode="Markdown")

@router.message(F.text == "💰 Мой баланс")
async def show_balance(message: types.Message):
    stats = await api_get_agent_stats(message.from_user.id)
    if not stats:
        await message.answer("Ошибка получения статистики. Попробуйте позже.")
        return
    
    # Основные показатели
    balance = stats.get('balance', 0)
    level1_count = stats.get('referrals_count_level_1', 0)
    level2_count = stats.get('referrals_count_level_2', 0)
    agents_count = stats.get('agents_invited', 0)
    earnings_l1 = stats.get('earnings_level_1', 0)
    earnings_l2 = stats.get('earnings_level_2', 0)
    invited_agents = stats.get('invited_agents', [])
    
    # Формируем сообщение
    text = (
        f"💰 **Общий баланс:** {balance} ₽\n"
        f"━━━━━━━━━━━━━━━━━━━━\n\n"
        f"📊 **Детализация заработка:**\n\n"
        f"**Level 1** (7% с продаж):\n"
        f"├ Рефералов: {level1_count} чел.\n"
        f"└ Заработано: {earnings_l1} ₽\n\n"
        f"**Level 2** (2% с продаж агентов):\n"
        f"├ Агентов приглашено: {agents_count}\n"
        f"├ Их рефералов: {level2_count} чел.\n"
        f"└ Заработано: {earnings_l2} ₽\n"
    )
    if invited_agents:
        text += "\n━━━━━━━━━━━━━━━━━━━━\n"
        text += "👥 **Ваши агенты:**\n\n"
        for i, agent in enumerate(invited_agents, 1):
            fio = agent.get('fio') or f"ID: {agent.get('tg_id')}"
            ref_count = agent.get('referrals_count', 0)
            orders = agent.get('total_orders', 0)
            text += f"{i}. {fio}\n"
            text += f"   └ Рефералов: {ref_count}, Заказов: {orders}\n"
    
    await message.answer(text, parse_mode="Markdown")