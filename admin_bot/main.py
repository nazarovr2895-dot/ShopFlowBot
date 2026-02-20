import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.redis import RedisStorage
from redis.asyncio import Redis

from admin_bot.config import ADMIN_BOT_TOKEN, REDIS_HOST, REDIS_PORT, REDIS_DB
from admin_bot.handlers import start


async def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    if not ADMIN_BOT_TOKEN:
        logging.error("ADMIN_BOT_TOKEN is not set. Exiting.")
        return

    redis = Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)
    storage = RedisStorage(redis=redis)

    bot = Bot(token=ADMIN_BOT_TOKEN)
    dp = Dispatcher(storage=storage)
    dp.include_router(start.router)

    await bot.delete_webhook(drop_pending_updates=True)
    logging.info("Admin bot (flurai_seller_bot) started!")

    try:
        await dp.start_polling(bot)
    finally:
        await redis.close()


if __name__ == "__main__":
    asyncio.run(main())
