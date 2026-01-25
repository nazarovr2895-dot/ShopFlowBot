import asyncio
from sqlalchemy import update
from backend.app.core.database import async_session
from backend.app.models.user import User

# 👇 ВПИШИ СЮДА СВОЙ ID
MY_ID = 8073613186  # Я взял ID из твоего лога ошибки. Если другой - поменяй.

async def main():
    print(f"👑 Назначаем пользователя {MY_ID} админом...")
    async with async_session() as session:
        # Обновляем роль
        await session.execute(
            update(User)
            .where(User.tg_id == MY_ID)
            .values(role='ADMIN')
        )
        await session.commit()
    print("✅ Готово! Перезапустите бота (или нажмите /start).")

if __name__ == "__main__":
    asyncio.run(main())