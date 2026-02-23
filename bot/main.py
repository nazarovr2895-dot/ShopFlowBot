import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.types import BotCommand
from aiogram.fsm.storage.redis import RedisStorage
from redis.asyncio import Redis

# Импортируем конфиг
from bot.config import BOT_TOKEN, REDIS_HOST, REDIS_PORT, REDIS_DB

# Импортируем базу данных и модели
from backend.app.core.database import engine, Base

# Импортируем API клиент для graceful shutdown
from bot.api_client.base import APIClient

# --- МОДЕЛИ ---
import backend.app.models.user
import backend.app.models.seller
import backend.app.models.order
import backend.app.models.product
# 👇 Закомментируй эти строки, если файлов еще нет, иначе будет ошибка!
# import backend.app.models.referral 
# import backend.app.models.settings

# Импортируем роутеры
from bot.handlers import start, buyer, paysupport

async def main():
    # Включаем подробное логирование
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)

    # 1. Создание таблиц (если их нет)
    logger.info("⏳ Проверка/Создание таблиц в БД...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 2. Инициализация бота с Redis для FSM storage
    logger.info(f"🔗 Подключение к Redis: {REDIS_HOST}:{REDIS_PORT}, db={REDIS_DB}")
    redis = Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)
    storage = RedisStorage(redis=redis)
    
    bot = Bot(token=BOT_TOKEN)
    dp = Dispatcher(storage=storage)

    # 3. Регистрация роутеров (ПОРЯДОК ВАЖЕН!)
    dp.include_router(start.router)   # <--- START ПЕРВЫЙ!
    dp.include_router(paysupport.router)
    dp.include_router(buyer.router)

    # 4. Регистрация команд бота (отображаются в меню Telegram)
    await bot.set_my_commands([
        BotCommand(command="start", description="Запустить бота"),
        BotCommand(command="paysupport", description="Оплата, возвраты, поддержка"),
    ])
    logger.info("✅ Команды бота зарегистрированы")

    # Удаляем старые апдейты (чтобы бот не отвечал на старые сообщения)
    await bot.delete_webhook(drop_pending_updates=True)

    logger.info("✅ Бот запущен!")
    
    # Запуск с graceful shutdown
    try:
        await dp.start_polling(bot)
    finally:
        # Закрываем все соединения при остановке
        logger.info("🔌 Закрытие соединений...")
        
        # Закрываем HTTP клиент
        await APIClient.close()
        logger.info("✅ HTTP клиент закрыт")
        
        # Закрываем Redis соединение
        await redis.close()
        logger.info("✅ Redis соединение закрыто")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Бот остановлен")