import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage

# Импортируем конфиг
from bot.config import BOT_TOKEN

# Импортируем базу данных и модели
from backend.app.core.database import engine, Base

# --- МОДЕЛИ ---
import backend.app.models.user
import backend.app.models.seller
import backend.app.models.order
import backend.app.models.product
# 👇 Закомментируй эти строки, если файлов еще нет, иначе будет ошибка!
# import backend.app.models.referral 
# import backend.app.models.settings

# Импортируем роутеры
from bot.handlers import start, seller, buyer, agent, admin

async def main():
    # Включаем подробное логирование
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)

    # 1. Создание таблиц (если их нет)
    logger.info("⏳ Проверка/Создание таблиц в БД...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 2. Инициализация бота
    bot = Bot(token=BOT_TOKEN)
    dp = Dispatcher(storage=MemoryStorage())

    # 3. Регистрация роутеров (ПОРЯДОК ВАЖЕН!)
    dp.include_router(start.router)   # <--- START ПЕРВЫЙ!
    dp.include_router(seller.router)
    dp.include_router(buyer.router)
    dp.include_router(agent.router)
    dp.include_router(admin.router)

    # Удаляем старые апдейты (чтобы бот не отвечал на старые сообщения)
    await bot.delete_webhook(drop_pending_updates=True)
    
    logger.info(f"✅ Бот запущен! Master Admin ID: {start.MASTER_ADMIN_ID}")
    
    # Запуск
    await dp.start_polling(bot)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Бот остановлен")