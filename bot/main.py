import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage

# Импортируем конфиг
from bot.config import BOT_TOKEN

# Импортируем базу данных и модели (ЧТОБЫ СОЗДАЛИСЬ ТАБЛИЦЫ)
from backend.app.core.database import engine, Base
# Важно импортировать сами файлы моделей, чтобы SQLAlchemy их увидела
import backend.app.models.user
import backend.app.models.seller
import backend.app.models.order
import backend.app.models.product
import backend.app.models.referral
import backend.app.models.settings

# Импортируем наши роутеры (хендлеры)
from bot.handlers import start, seller, buyer, agent, admin

async def main():
    # Настройка логирования
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)

    # 1. Инициализация базы данных (Создание таблиц)
    logger.info("Создаем таблицы в базе данных...")
    async with engine.begin() as conn:
        # Эта команда создаст все таблицы, описанные в моделях
        await conn.run_sync(Base.metadata.create_all)

    # 2. Инициализация бота
    bot = Bot(token=BOT_TOKEN)
    dp = Dispatcher(storage=MemoryStorage())

    # 3. Регистрация роутеров
    dp.include_router(start.router)
    dp.include_router(seller.router)
    dp.include_router(buyer.router)
    dp.include_router(agent.router)
    dp.include_router(admin.router)

    # Удаляем вебхуки и запускаем поллинг
    await bot.delete_webhook(drop_pending_updates=True)
    logger.info("✅ Бот запущен и готов к работе!")
    await dp.start_polling(bot)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Бот остановлен")