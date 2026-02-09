"""
Legacy configuration module for backward compatibility.
New code should use backend.app.core.settings.get_settings() instead.
"""
import os
from dotenv import load_dotenv

# Загружаем переменные из файла .env
load_dotenv()

# Try to use new settings system, fallback to old system
try:
    from backend.app.core.settings import get_settings
    _settings = get_settings()
    
    # Export settings for backward compatibility
    BOT_TOKEN = _settings.BOT_TOKEN
    DB_USER = _settings.DB_USER
    DB_PASS = _settings.DB_PASSWORD
    DB_NAME = _settings.DB_NAME
    DB_HOST = _settings.DB_HOST
    DB_PORT = _settings.DB_PORT
    DB_URL = _settings.db_url
    REDIS_HOST = _settings.REDIS_HOST
    REDIS_PORT = _settings.REDIS_PORT
    REDIS_DB = _settings.REDIS_DB
except Exception:
    # Fallback to old system for backward compatibility
    BOT_TOKEN = os.getenv("BOT_TOKEN")
    if not BOT_TOKEN:
        exit("Error: BOT_TOKEN not found in .env file")
    
    DB_USER = os.getenv("DB_USER")
    DB_PASS = os.getenv("DB_PASSWORD")
    DB_NAME = os.getenv("DB_NAME")
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = os.getenv("DB_PORT", "5432")
    DB_URL = f"postgresql+asyncpg://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    
    REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
    REDIS_DB = int(os.getenv("REDIS_DB", 0))
