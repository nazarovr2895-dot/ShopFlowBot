from aiogram import Router, F, types, Bot
from aiogram.utils.deep_linking import create_start_link
import bot.keyboards.reply as kb

router = Router()

@router.message(F.text == "🔗 Моя ссылка для покупателя")
async def get_agent_link(message: types.Message, bot: Bot):
    # Генерируем ссылку вида t.me/bot?start=agent_12345
    link = await create_start_link(bot, f"agent_{message.from_user.id}", encode=True)
    await message.answer(
        f"🤝 *Ваша ссылка посредника:*\n\n`{link}`\n\n"
        "Отправляйте её клиентам. Все заказы по этой ссылке будут закреплены за вами.",
        parse_mode="Markdown"
    )

@router.message(F.text == "💰 Мой баланс")
async def check_balance(message: types.Message):
    # Здесь позже сделаем подсчет прибыли из базы
    await message.answer("Ваш текущий баланс: *0 руб.*\nДоступно к выводу: *0 руб.*", parse_mode="Markdown")