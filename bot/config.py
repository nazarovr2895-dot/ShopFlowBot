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

# URL Mini App для кнопки каталога
MINI_APP_URL = os.getenv("MINI_APP_URL", "https://flowshop-miniapp.vercel.app")