from aiogram import Router, F, types
from aiogram.filters import CommandStart, CommandObject
from aiogram.fsm.context import FSMContext
import bot.keyboards.reply as kb
from bot.api_client.buyers import api_register_user, api_get_user
router = Router()

@router.message(CommandStart())
async def cmd_start(message: types.Message, command: CommandObject, state: FSMContext):
    await state.clear()
    
    tg_id = message.from_user.id
    username = message.from_user.username
    fio = message.from_user.full_name
    
    # 1. Парсинг Deep Link
    args = command.args
    referrer_id = None
    target_seller_id = None

    if args:
        if args.startswith("agent_"):
            try:
                r_id = int(args.replace("agent_", ""))
                if r_id != tg_id: referrer_id = r_id
            except: pass
        elif args.startswith("seller_"):
            try:
                target_seller_id = int(args.replace("seller_", ""))
            except: pass

    # 2. Регистрация
    user = await api_register_user(tg_id, username, fio, referrer_id=referrer_id)
    
    # 3. Определение роли (админка теперь в веб-приложении)
    role = user.role if user else "BUYER"

    # 4. Логика перехода по ссылке
    if target_seller_id:
        await state.update_data(current_seller_id=target_seller_id)
        # Выдаем меню ПОКУПАТЕЛЯ (с кнопкой админа, если это ты)
        menu = kb.get_main_kb(tg_id, "BUYER")
        await message.answer(
            "🌸 Вы перешли в магазин!",
            reply_markup=menu,
            parse_mode="Markdown"
        )
        # Сразу показываем товары магазина (импортируем внутри функции, чтобы избежать циклических импортов)
        from bot.handlers.buyer import show_shop_products
        await show_shop_products(message, target_seller_id)
        return

    if referrer_id:
        menu = kb.get_main_kb(tg_id, "BUYER")
        await message.answer("👋 Добро пожаловать! Вы зарегистрированы по приглашению партнера.", reply_markup=menu)
        return

    # 5. Обычный вход (Главное меню)
    menu = kb.get_main_kb(tg_id, role)
    
    if role == 'SELLER':
        await message.answer("📦 Режим ПРОДАВЦА.", reply_markup=menu)
    elif role == 'AGENT':
        await message.answer("🤝 Режим ПОСРЕДНИКА.", reply_markup=menu)
    else:
        await message.answer("🛒 Режим ПОКУПАТЕЛЯ.", reply_markup=menu)


# --- ПЕРЕКЛЮЧЕНИЯ ---

@router.message(F.text.in_({"🛍 Режим покупателя", "🔁 Режим покупателя"}))
async def switch_to_buyer(message: types.Message, state: FSMContext):
    await state.clear()
    menu = kb.get_main_kb(message.from_user.id, "BUYER")
    await message.answer("Переключено в режим покупателя.", reply_markup=menu)