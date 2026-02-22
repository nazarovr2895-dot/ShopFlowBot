import os
from dotenv import load_dotenv

# Загружаем переменные из .env
load_dotenv()

# Получаем токен
BOT_TOKEN = os.getenv("BOT_TOKEN")

# Проверка, чтобы бот не падал молча
if not BOT_TOKEN:
    # Если токена нет, выводим ошибку в консоль
    print("❌ ОШИБКА: Не найден BOT_TOKEN в файле .env")

# Если запускаем в Docker, будет backend, если локально — localhost
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

# Internal API key for bot-to-backend auth on order management endpoints
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")

# URL Mini App для кнопки каталога
MINI_APP_URL = os.getenv("MINI_APP_URL", "https://flowshop-miniapp.vercel.app")

# Redis конфигурация для FSM Storage
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))

# Master Admin ID (зарезервировано для будущего использования)
MASTER_ADMIN_ID = int(os.getenv("MASTER_ADMIN_ID", "0"))