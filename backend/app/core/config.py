import os
from dotenv import load_dotenv

# Загружаем переменные из файла .env
load_dotenv()

# Достаем токен
BOT_TOKEN = os.getenv("BOT_TOKEN")

if not BOT_TOKEN:
    exit("Error: BOT_TOKEN not found in .env file")
# Получаем данные
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")
DB_HOST = os.getenv("DB_HOST", "localhost") # Если запускаешь локально - localhost
DB_PORT = os.getenv("DB_PORT", "5432")

# Собираем ссылку для SQLAlchemy
# Пример: postgresql+asyncpg://user:pass@localhost:5432/dbname
DB_URL = f"postgresql+asyncpg://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Redis конфигурация
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))
