import asyncio
from sqlalchemy import text
from bot.database.models import engine, Base, City, District, async_session

async def reset_and_seed():
    print("🔄 Начинаю принудительную очистку базы (CASCADE)...")
    async with engine.begin() as conn:
        # Для PostgreSQL: удаляем таблицы принудительно, игнорируя зависимости
        tables = ['sellers', 'agents', 'orders', 'products', 'metro_stations', 'districts', 'users', 'cities', 'settings']
        for table in tables:
            await conn.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE;"))
        
        print("🗑 Все таблицы и связи удалены.")
        
        # Создаем структуру заново
        await conn.run_sync(Base.metadata.create_all)
        print("🏗 Новая структура создана.")
    
    # Заполняем справочники
    async with async_session() as session:
        print("🌱 Заполняю Москву и округа...")
        moscow = City(id=1, name="Москва")
        session.add(moscow)
        
        districts = [
            District(id=1, city_id=1, name="ЦАО"),
            District(id=2, city_id=1, name="САО"),
            District(id=3, city_id=1, name="СВАО"),
            District(id=4, city_id=1, name="ВАО"),
            District(id=5, city_id=1, name="ЮВАО"),
            District(id=6, city_id=1, name="ЮАО"),
            District(id=7, city_id=1, name="ЮЗАО"),
            District(id=8, city_id=1, name="ЗАО"),
            District(id=9, city_id=1, name="СЗАО"),
            District(id=10, city_id=1, name="НАО"),
            District(id=11, city_id=1, name="ТАО"),
            District(id=12, city_id=1, name="ЗелАО"),
        ]
        session.add_all(districts)
        await session.commit()
    print("✅ База данных полностью готова!")

if __name__ == "__main__":
    asyncio.run(reset_and_seed())