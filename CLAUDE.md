# ShopFlowBot Project Guide

> Руководство для Claude Code по работе с проектом ShopFlowBot - платформой для торговли через Telegram Mini App

## Обзор проекта

**ShopFlowBot** - это полнофункциональная e-commerce платформа, построенная как Telegram Mini App. Проект включает:

- **Backend API** (FastAPI + PostgreSQL + Redis)
- **Telegram Bot** (aiogram 3.x)
- **Mini App** (React + TypeScript + Vite) - каталог для покупателей
- **Admin Panel** (React + TypeScript + Vite) - панель управления для администраторов

### Архитектура

```
┌─────────────────┐      ┌──────────────────┐
│  Telegram Bot   │◄────►│   Backend API    │
│   (aiogram)     │      │    (FastAPI)     │
└─────────────────┘      └────────┬─────────┘
                                  │
        ┌─────────────────────────┼─────────────────┐
        │                         │                 │
┌───────▼─────────┐   ┌───────────▼──────┐  ┌──────▼──────┐
│   Mini App      │   │  Admin Panel     │  │  PostgreSQL │
│ (React/Vite)    │   │  (React/Vite)    │  │   + Redis   │
└─────────────────┘   └──────────────────┘  └─────────────┘
```

## Структура проекта

```
ShopFlowBot/
├── backend/                 # FastAPI приложение
│   ├── app/
│   │   ├── api/            # REST API endpoints
│   │   ├── core/           # Конфигурация, БД, логирование
│   │   ├── models/         # SQLAlchemy модели
│   │   ├── services/       # Бизнес-логика
│   │   └── main.py         # Точка входа FastAPI
│   ├── migrations/         # Alembic миграции
│   ├── tests/              # Тесты (pytest)
│   └── requirements.txt
│
├── bot/                    # Telegram бот
│   ├── handlers/           # Обработчики команд и callback'ов
│   ├── keyboards/          # Клавиатуры
│   ├── api_client/         # HTTP клиент для backend
│   └── main.py
│
├── miniapp/                # React Mini App (покупатели)
│   ├── src/
│   │   ├── components/    # UI компоненты
│   │   ├── pages/         # Страницы приложения
│   │   ├── hooks/         # React хуки
│   │   ├── api/           # API клиент
│   │   └── App.tsx
│   └── package.json
│
├── adminpanel/            # React Admin Panel
│   └── src/
│
├── nginx/                 # Nginx конфигурация
├── scripts/               # Утилиты (бэкапы, миграции)
├── docker-compose.prod.yml
└── .env                   # Переменные окружения (НЕ коммитить!)
```

## Стек технологий

### Backend
- **FastAPI** 0.109.0 - современный async web framework
- **SQLAlchemy** 2.0.30 (async) - ORM
- **PostgreSQL** 15 - основная БД
- **Redis** 7 - кэширование и очереди
- **Alembic** - миграции БД
- **Pydantic** - валидация данных
- **Prometheus** - метрики
- **Structlog** - структурированное логирование

### Bot
- **aiogram** 3.x - Telegram Bot framework
- **Redis** - FSM storage

### Frontend (Mini App + Admin)
- **React** 18.3.1
- **TypeScript** 5.6.3
- **Vite** 5.4.11
- **React Router DOM** 6.28.0
- **@twa-dev/sdk** (только в miniapp) - Telegram Web App SDK

### DevOps
- **Docker** + **Docker Compose** - контейнеризация
- **Nginx** - reverse proxy + SSL termination

## Workflow разработки

### Локальная разработка

#### 1. Первый запуск

```bash
# Клонировать репозиторий
git clone <repo-url>
cd ShopFlowBot

# Создать .env файл
cp .env.example .env  # отредактируйте переменные!

# Запустить все сервисы
docker-compose up -d

# Применить миграции
docker compose exec backend bash -c "cd /src/backend && alembic upgrade head"
```

#### 2. Разработка с hot reload

```bash
# Backend (с автоперезагрузкой)
cd backend
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000

# Mini App (в отдельном терминале)
cd miniapp
npm install
npm run dev

# Admin Panel (в отдельном терминале)
cd adminpanel
npm install
npm run dev

# Bot (в отдельном терминале)
cd bot
python main.py
```

#### 3. Работа с базой данных

```bash
# Создать новую миграцию
cd backend
alembic revision --autogenerate -m "описание изменений"

# Применить миграции
alembic upgrade head

# Откатить последнюю миграцию
alembic downgrade -1

# Посмотреть текущую версию
alembic current

# История миграций
alembic history
```

### Production деплой

#### Используйте deploy.sh скрипт:

```bash
# Деплой через скрипт (commit + push + обновление сервера)
./deploy.sh "описание изменений"
```

Скрипт автоматически:
1. Коммитит изменения
2. Пушит в GitHub
3. Подключается к серверу
4. Обновляет код (git pull)
5. Пересобирает Docker образы
6. Перезапускает сервисы

#### Или вручную:

```bash
# Локально
git add .
git commit -m "feat: описание"
git push

# На сервере
ssh yandex-cloud
cd ~/shopflowbot
git pull
docker compose -f docker-compose.prod.yml build backend bot admin miniapp
docker compose -f docker-compose.prod.yml up -d
```

## Частые задачи

### 1. Добавление нового API endpoint

**Файлы:** `backend/app/api/`

```python
# backend/app/api/my_endpoint.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.api.deps import get_session

router = APIRouter()

@router.get("/items")
async def get_items(session: AsyncSession = Depends(get_session)):
    # Ваша логика
    return {"items": []}
```

Зарегистрировать в `backend/app/main.py`:
```python
from backend.app.api import my_endpoint
app.include_router(my_endpoint.router, prefix="/api", tags=["items"])
```

### 2. Добавление новой модели БД

**Файлы:** `backend/app/models/`

```python
# backend/app/models/my_model.py
from sqlalchemy import Column, Integer, String, DateTime
from backend.app.core.database import Base
from datetime import datetime

class MyModel(Base):
    __tablename__ = "my_table"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
```

Импортировать в `bot/main.py`:
```python
import backend.app.models.my_model
```

Создать миграцию:
```bash
cd backend
alembic revision --autogenerate -m "add my_table"
alembic upgrade head
```

### 3. Добавление handler'а в бот

**Файлы:** `bot/handlers/`

```python
# bot/handlers/my_handler.py
from aiogram import Router, F
from aiogram.types import Message

router = Router()

@router.message(F.text == "Команда")
async def handle_command(message: Message):
    await message.answer("Ответ")
```

Зарегистрировать в `bot/main.py`:
```python
from bot.handlers import my_handler
dp.include_router(my_handler.router)
```

### 4. Добавление компонента в Mini App

**Файлы:** `miniapp/src/components/`

```tsx
// miniapp/src/components/MyComponent.tsx
import React from 'react';

interface MyComponentProps {
  title: string;
}

export const MyComponent: React.FC<MyComponentProps> = ({ title }) => {
  return <div>{title}</div>;
};
```

Использовать в странице:
```tsx
// miniapp/src/pages/MyPage.tsx
import { MyComponent } from '../components/MyComponent';

export const MyPage = () => {
  return <MyComponent title="Hello" />;
};
```

### 5. Тестирование

```bash
# Backend тесты
cd backend
pytest tests/ -v

# Тесты с покрытием
pytest tests/ --cov=backend.app

# Запуск конкретного теста
pytest tests/test_api.py::test_create_user -v
```

## Полезные команды

### Docker

```bash
# Пересобрать контейнер
docker compose -f docker-compose.prod.yml build backend

# Перезапустить сервис
docker compose -f docker-compose.prod.yml restart backend

# Зайти в контейнер
docker compose exec backend bash

# Посмотреть статус
docker compose ps

# Остановить всё
docker compose down

# Логи
docker compose logs -f backend
docker compose logs --tail 50 backend
```

### База данных

```bash
# Подключиться к PostgreSQL
docker compose exec db psql -U postgres shopflowbot

# SQL запрос напрямую
docker compose exec db psql -U postgres shopflowbot -c "SELECT COUNT(*) FROM users;"

# Бэкап БД
docker compose exec db pg_dump -U postgres shopflowbot > backup_$(date +%Y%m%d).sql

# Восстановление
docker compose exec -T db psql -U postgres shopflowbot < backup_20250214.sql
```

### Git

```bash
# Стандартный workflow
git add .
git commit -m "тип: описание"
git push

# Или через deploy.sh
./deploy.sh "feat: новая функция"

# Типы коммитов (conventional commits):
# feat:     новая функциональность
# fix:      исправление бага
# refactor: рефакторинг
# docs:     документация
# test:     тесты
# chore:    обновление зависимостей, конфигурации
```

## Мониторинг

### Health Check

```bash
# Проверить здоровье сервиса
curl http://localhost:8000/health

# Ожидаемый ответ:
{
  "status": "healthy",
  "version": "1.0.0",
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

### Метрики (Prometheus)

```bash
# Проверить метрики
curl http://localhost:8000/metrics
```

Доступные метрики:
- HTTP запросы (rate, latency, errors)
- Метрики БД (connection pool)
- Метрики Redis
- Бизнес-метрики (заказы, продукты)

### Логи

```bash
# Логи backend
docker compose logs -f backend

# Логи бота
docker compose logs -f bot

# Логи с фильтрацией
docker compose logs backend | grep ERROR
```

## Проблемы и решения

### Backend не запускается

1. Проверить логи: `docker compose logs backend`
2. Проверить health: `curl http://localhost:8000/health`
3. Проверить переменные окружения в `.env`
4. Проверить подключение к БД и Redis

### Миграции не применяются

```bash
# Проверить текущую версию
docker compose exec backend bash -c "cd /src/backend && alembic current"

# Применить заново
docker compose exec backend bash -c "cd /src/backend && alembic upgrade head"

# Если конфликт - откатить и применить снова
docker compose exec backend bash -c "cd /src/backend && alembic downgrade -1 && alembic upgrade head"
```

### Frontend не собирается

1. Проверить `VITE_API_URL` в build args
2. Очистить кэш: `rm -rf node_modules package-lock.json && npm install`
3. Проверить TypeScript ошибки: `npm run build`

### Бот не отвечает

1. Проверить логи: `docker compose logs bot`
2. Проверить `BOT_TOKEN` в `.env`
3. Проверить подключение к backend API

## Дополнительные ресурсы

- **API документация:** http://localhost:8000/docs (Swagger UI)
- **Workflow разработки:** `DEVELOPMENT_WORKFLOW.md`
- **Production готовность:** `PRODUCTION_READY.md`
- **Масштабирование:** `SCALING.md`
- **SSL настройка:** `SSL_SETUP.md`
- **Команды сервера:** `SERVER_COMMANDS.md`
- **Мониторинг:** `backend/MONITORING.md`
- **Тестирование:** `backend/TESTING.md`
- **Использование deploy.sh:** `SIMPLE_SOLUTION.md`

## Соглашения по коду

### Python (Backend/Bot)
- PEP 8 style guide
- Type hints обязательны
- Async/await для I/O операций
- Pydantic для валидации данных
- Docstrings для публичных функций

### TypeScript (Frontend)
- Strict mode enabled
- Functional components + hooks
- Props interfaces обязательны
- CSS modules или inline styles
- Именование: PascalCase для компонентов, camelCase для функций

### Git
- Conventional commits (`feat:`, `fix:`, и т.д.)
- Короткие осмысленные коммиты
- Не коммитить `.env`, `node_modules`, `__pycache__`

---

**Версия:** 1.0.0
**Последнее обновление:** 2025-02-14
