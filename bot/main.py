import asyncio
import logging
import sys

from aiogram import Bot, Dispatcher
from bot.config import TOKEN
from bot.database.models import db_main

async def main():
    # Инициализация базы данных
    await db_main()
    
    bot = Bot(token=TOKEN)
    dp = Dispatcher()

    print("Бот запущен и готов к работе!")
    await dp.start_polling(bot)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Бот выключен")