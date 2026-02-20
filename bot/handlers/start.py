from aiogram import Router, types
from aiogram.filters import CommandStart, CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.types import ReplyKeyboardRemove
from bot.api_client.buyers import api_register_user, api_get_user

router = Router()

WELCOME_TEXT = (
    "Добро пожаловать в Flurai!\n"
    "\n"
    "Flurai — платформа для удобных покупок прямо в Telegram.\n"
    "Здесь вы можете просматривать каталог товаров, "
    "оформлять заказы и отслеживать доставку.\n"
    "\n"
    "Откройте приложение через кнопку меню слева от поля ввода, "
    "чтобы начать покупки."
)

WELCOME_SELLER_LINK = (
    "Вы перешли в магазин!\n"
    "\n"
    "Откройте приложение через кнопку меню — "
    "там можно посмотреть товары и оформить заказ."
)

WELCOME_REFERRER = (
    "Добро пожаловать в Flurai!\n"
    "Вы зарегистрированы по приглашению партнёра.\n"
    "\n"
    "Откройте приложение через кнопку меню, чтобы начать покупки."
)


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
        if args.startswith("seller_"):
            try:
                target_seller_id = int(args.replace("seller_", ""))
            except:
                pass

    # 2. Регистрация
    user = await api_register_user(tg_id, username, fio, referrer_id=referrer_id)

    # 3. Определение роли
    role = user.role if user else "BUYER"

    # 4. Переход по ссылке магазина
    if target_seller_id:
        await state.update_data(current_seller_id=target_seller_id)
        await message.answer(
            WELCOME_SELLER_LINK,
            reply_markup=ReplyKeyboardRemove(),
        )
        return

    if referrer_id:
        await message.answer(
            WELCOME_REFERRER,
            reply_markup=ReplyKeyboardRemove(),
        )
        return

    # 5. Обычный вход
    await message.answer(
        WELCOME_TEXT,
        reply_markup=ReplyKeyboardRemove(),
    )
