from aiogram import Router, F, types
from aiogram.filters import CommandStart, CommandObject
from aiogram.fsm.context import FSMContext # Добавлен импорт
from bot.database.requests import get_user_role
import bot.keyboards.reply as kb

router = Router()

@router.message(CommandStart())
async def cmd_start(message: types.Message, command: CommandObject, state: FSMContext): # Добавлен state
    user_id = message.from_user.id
    role = await get_user_role(user_id)
    is_admin = (role == 'ADMIN')
    
# 1. ПРОВЕРКА ГЛУБОКОЙ ССЫЛКИ
    # 1. ПРОВЕРКА ГЛУБОКОЙ ССЫЛКИ
    args = command.args
    if args:
        if args.startswith("seller_"):
            try:
                seller_id = int(args.replace("seller_", ""))
                await state.update_data(current_seller_id=seller_id)
                await message.answer(
                    f"🌸 Добро пожаловать! Вы зашли в магазин по ссылке.\nНажмите '🛍 Открыть магазин', чтобы увидеть каталог.",
                    reply_markup=kb.get_buyer_main(is_admin=is_admin)
                )
                return 
            except ValueError:
                await message.answer("Ошибка в ссылке продавца.")
        
        elif args.startswith("agent_"):
            try:
                agent_id = int(args.replace("agent_", ""))
                await state.update_data(current_agent_id=agent_id)
                await message.answer("🌸 Вы зашли в магазин по рекомендации посредника!")
            except ValueError:
                await message.answer("Ошибка в ссылке посредника.")
    # 2. СТАНДАРТНЫЙ ВХОД ПО РОЛЯМ
    if is_admin:
        await message.answer("👑 АДМИН-ПАНЕЛЬ активирована.", reply_markup=kb.admin_main)
    elif role == 'SELLER':
        await message.answer("📦 Режим ПРОДАВЦА.", reply_markup=kb.get_seller_main(is_admin=False))
    else:
        await message.answer("🛒 Режим ПОКУПАТЕЛЯ.", reply_markup=kb.get_buyer_main(is_admin=False))

# Остальная логика переключения (switch_to_buyer, и т.д.) остается без изменений, она верна.
# --- УЛУЧШЕННАЯ ЛОГИКА ПЕРЕКЛЮЧЕНИЯ ---

@router.message(F.text == "🔄 Перейти в режим покупателя")
@router.message(F.text == "🔁 Режим покупателя")
async def switch_to_buyer(message: types.Message):
    role = await get_user_role(message.from_user.id)
    # Используем функцию вместо старой переменной
    await message.answer("🛒 Режим ПОКУПАТЕЛЯ.", reply_markup=kb.get_buyer_main(is_admin=(role == 'ADMIN')))

@router.message(F.text == "🔁 Режим продавца")
async def switch_to_seller(message: types.Message):
    role = await get_user_role(message.from_user.id)
    
    if role in ['ADMIN', 'SELLER']:
        await message.answer("📦 Режим ПРОДАВЦА.", reply_markup=kb.get_seller_main(is_admin=(role == 'ADMIN')))
    else:
        # Ошибка доступа для обычных юзеров
        await message.answer(
            "⚠️ У вас нет доступа к режиму продавца.",
            reply_markup=types.InlineKeyboardMarkup(inline_keyboard=[
                [types.InlineKeyboardButton(text="💬 Стать продавцом", url="https://t.me/ваш_логин")]
            ])
        )

@router.message(F.text == "👑 Вернуться в АДМИН-ПАНЕЛЬ")
async def back_to_admin(message: types.Message):
    role = await get_user_role(message.from_user.id)
    if role == 'ADMIN':
        await message.answer("Вы в главном меню админа.", reply_markup=kb.admin_main)

# --- ПРЯМЫЕ ВХОДЫ ИЗ АДМИНКИ ---

@router.message(F.text == "🛍 Режим покупателя")
async def admin_switch_buyer(message: types.Message):
    await message.answer("Вход в режим покупателя...", reply_markup=kb.get_buyer_main(is_admin=True))

@router.message(F.text == "📦 Режим продавца")
async def admin_switch_seller(message: types.Message):
    await message.answer("Вход в режим продавца...", reply_markup=kb.get_seller_main(is_admin=True))

@router.message(F.text == "🤝 Режим посредника")
async def admin_switch_agent(message: types.Message):
    await message.answer("Вход в режим посредника...", reply_markup=kb.get_agent_main(is_admin=True))