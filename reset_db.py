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
        print("🌱 Заполняю Москву...")
        moscow = City(id=1, name="Москва", kladr_id="7700000000000")
        session.add(moscow)
        await session.commit()
        # Районы импортируются через админ-панель (Coverage → Import Districts)
    print("✅ База данных полностью готова!")

if __name__ == "__main__":
    asyncio.run(reset_and_seed())