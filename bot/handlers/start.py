from aiogram import Router, F, types
from aiogram.filters import CommandStart, CommandObject
from aiogram.fsm.context import FSMContext

# ❗ ИМПОРТИРУЕМ API ВМЕСТО БД
from bot.api_client.buyers import api_register_user, api_get_user
from bot.api_client.referrals import api_register_ref_link
import bot.keyboards.reply as kb

router = Router()

@router.message(CommandStart())
async def cmd_start(message: types.Message, command: CommandObject, state: FSMContext):
    tg_id = message.from_user.id
    username = message.from_user.username
    fio = message.from_user.full_name

    # 1. РЕГИСТРАЦИЯ ЧЕРЕЗ API (Бэкенд сам решит, новый это юзер или старый)
    # Эта функция вернет объект пользователя с его ролью
    user = await api_register_user(tg_id, username, fio)
    role = user.role if user else "BUYER"

    # 2. ПРОВЕРКА ГЛУБОКОЙ ССЫЛКИ (Deep Linking)
    args = command.args
    if args:
        # Если ссылка на магазин (seller_123)
        if args.startswith("seller_"):
            try:
                seller_id = int(args.replace("seller_", ""))
                await state.update_data(current_seller_id=seller_id)
                await message.answer(
                    "🌸 Добро пожаловать! Вы зашли в магазин по ссылке.\nНажмите '🌸 Открыть магазин', чтобы увидеть каталог.",
                    reply_markup=kb.buyer_main
                )
                return 
            except ValueError:
                await message.answer("Ошибка в ссылке продавца.")
        
        # Если ссылка от агента (agent_123)
        elif args.startswith("agent_"):
            try:
                referrer_id = int(args.replace("agent_", ""))
                if referrer_id != tg_id:
                    # Отправляем в API запрос на связку рефералов
                    await api_register_ref_link(new_user_id=tg_id, referrer_id=referrer_id)
                    await state.update_data(current_agent_id=referrer_id)
                    await message.answer("🌸 Вы зашли по рекомендации партнера!", reply_markup=kb.buyer_main)
                return
            except ValueError:
                await message.answer("Ошибка в ссылке посредника.")

    # 3. СТАНДАРТНОЕ МЕНЮ ПО РОЛЯМ
    if role == 'ADMIN':
        await message.answer("👑 АДМИН-ПАНЕЛЬ активирована.", reply_markup=kb.admin_main)
    elif role == 'SELLER':
        # Проверка блокировки могла бы быть тут, но пока пускаем в меню
        await message.answer("📦 Режим ПРОДАВЦА.", reply_markup=kb.seller_main)
    else:
        await message.answer("🛒 Режим ПОКУПАТЕЛЯ.", reply_markup=kb.buyer_main)

# --- ПЕРЕКЛЮЧЕНИЯ РЕЖИМОВ ---

@router.message(F.text.in_({"🛍 Режим покупателя", "🔁 Режим покупателя"}))
async def switch_to_buyer(message: types.Message):
    await message.answer("Переключено в режим покупателя.", reply_markup=kb.buyer_main)

@router.message(F.text.in_({"📦 Режим продавца", "🔁 Режим продавца"}))
async def switch_to_seller(message: types.Message):
    # Запрашиваем актуальные данные пользователя через API
    user = await api_get_user(message.from_user.id)
    
    if user and (user.role == 'ADMIN' or user.role == 'SELLER'):
        await message.answer("📦 Режим ПРОДАВЦА.", reply_markup=kb.seller_main)
    else:
        await message.answer(
            "⚠️ У вас нет доступа к режиму продавца. Свяжитесь с админом.",
            reply_markup=types.InlineKeyboardMarkup(inline_keyboard=[
                [types.InlineKeyboardButton(text="💬 Стать продавцом", url="https://t.me/admin_username")]
            ])
        )

@router.message(F.text.in_({"🤝 Режим посредника", "🔁 Режим посредника"}))
async def switch_to_agent(message: types.Message):
    await message.answer("Переключено в режим посредника.", reply_markup=kb.agent_main)

@router.message(F.text == "👑 Вернуться в АДМИН-ПАНЕЛЬ")
async def back_to_admin(message: types.Message):
    user = await api_get_user(message.from_user.id)
    if user and user.role == 'ADMIN':
        await message.answer("Вы вернулись в меню администратора.", reply_markup=kb.admin_main)