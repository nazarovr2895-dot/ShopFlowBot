import os
import sys
from logging.config import fileConfig
from pathlib import Path
from urllib.parse import quote_plus

from sqlalchemy import create_engine, pool
from sqlalchemy.engine import Connection

from alembic import context

# Добавляем корневую директорию проекта в sys.path для импорта модулей
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

# Синхронный URL для миграций (psycopg2) — без asyncio/asyncpg, стабильно в контейнере
def _get_sync_db_url():
    user = os.environ.get("DB_USER", "postgres")
    password = quote_plus(os.environ.get("DB_PASSWORD", ""))
    host = os.environ.get("DB_HOST", "localhost")
    port = os.environ.get("DB_PORT", "5432")
    name = os.environ.get("DB_NAME", "postgres")
    return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{name}"

SYNC_DB_URL = _get_sync_db_url()

# Импортируем Base и все модели для автогенерации миграций
from backend.app.core.base import Base

# Импортируем все модели, чтобы они зарегистрировались в метаданных
from backend.app.models import user, seller, order, product, referral, settings, crm, loyalty

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# ConfigParser трактует % как интерполяцию; экранируем для записи в конфиг
config.set_main_option("sqlalchemy.url", SYNC_DB_URL.replace("%", "%%"))

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Устанавливаем метаданные моделей для автогенерации
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Выполнение миграций с переданным соединением."""
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode using sync engine (psycopg2)."""
    connectable = create_engine(SYNC_DB_URL, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        do_run_migrations(connection)
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
