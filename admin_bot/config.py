import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv not needed in Docker (env vars set via docker-compose)

ADMIN_BOT_TOKEN = os.getenv("ADMIN_BOT_TOKEN")
if not ADMIN_BOT_TOKEN:
    print("ADMIN_BOT_TOKEN not found in .env")

ADMIN_MINI_APP_URL = os.getenv("ADMIN_MINI_APP_URL", "https://admin.flurai.ru")

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 1))
