import asyncio
import logging
import sys
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.redis import RedisStorage
from redis.asyncio import Redis

from bot.config import TOKEN
from bot.database.models import db_main
from bot.handlers.start import router as start_router
from bot.handlers.seller import router as seller_router
from bot.middlewares.reset_state import ResetStateMiddleware # Наш новый фильтр
from bot.handlers.buyer import router as buyer_router
from bot.handlers.admin import router as admin_router

async def main():
    # 1. Инициализация БД
    await db_main()
    
    # 2. Настройка Redis
    redis = Redis(host='localhost')
    storage = RedisStorage(redis=redis)
    
    # 3. СНАЧАЛА СОЗДАЕМ DISPATCHER (dp)
    bot = Bot(token=TOKEN)
    dp = Dispatcher(storage=storage)

    # 4. ТЕПЕРЬ ПОДКЛЮЧАЕМ MIDDLEWARE (когда dp уже существует)
    dp.message.middleware(ResetStateMiddleware())

    # 5. Регистрация роутеров
    dp.include_router(start_router)
    dp.include_router(seller_router)
    dp.include_router(admin_router)

    dp.include_router(buyer_router)

    print("✅ Бот запущен с защитой от зависания состояний!")
    
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("❌ Бот выключен")