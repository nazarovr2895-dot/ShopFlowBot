import asyncio
from bot.database.models import User, async_session
from sqlalchemy import select

async def make_me_admin(tg_id: int):
    async with async_session() as session:
        # Ищем пользователя в базе
        user = await session.get(User, tg_id)
        
        if user:
            user.role = 'ADMIN'
            print(f"✅ Роль пользователя {tg_id} изменена на ADMIN.")
        else:
            # Если вы еще не нажали /start после сброса, создаем запись сразу
            new_admin = User(tg_id=tg_id, role='ADMIN')
            session.add(new_admin)
            print(f"✅ Пользователь {tg_id} добавлен в базу как ADMIN.")
        
        await session.commit()

if __name__ == "__main__":
    MY_ID = int(input("Введите ваш Telegram ID: "))
    asyncio.run(make_me_admin(MY_ID))