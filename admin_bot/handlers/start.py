from aiogram import Router, types
from aiogram.filters import CommandStart
from aiogram.utils.keyboard import ReplyKeyboardBuilder
from aiogram.types import KeyboardButton, WebAppInfo

from admin_bot.config import ADMIN_MINI_APP_URL

router = Router()


@router.message(CommandStart())
async def cmd_start(message: types.Message):
    builder = ReplyKeyboardBuilder()
    builder.row(
        KeyboardButton(
            text="Панель управления",
            web_app=WebAppInfo(url=ADMIN_MINI_APP_URL),
        )
    )
    await message.answer(
        "Добро пожаловать в Flurai Seller Bot.\n"
        "Нажмите кнопку ниже, чтобы открыть панель управления.",
        reply_markup=builder.as_markup(resize_keyboard=True),
    )
