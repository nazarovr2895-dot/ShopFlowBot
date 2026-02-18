# TESTS_GUIDE.md — Руководство по тестированию Flurai

> Полное руководство по тестированию проекта Flurai: структура, типы тестов, запуск, примеры и рекомендации.

---

## 1. Введение

Flurai — это e-commerce платформа на базе Telegram Mini App. Проект включает:

- **Backend API** (FastAPI + SQLAlchemy async + PostgreSQL + Redis)
- **Telegram Bot** (aiogram 3.x)
- **Mini App** (React + TypeScript + Vite)
- **Admin Panel** (React + TypeScript + Vite)

Тестами покрыт **backend** — как API-эндпоинты, так и бизнес-логика сервисов. Для бота и фронтенда тестирование описано в разделе рекомендаций.

### Текущее покрытие

| Компонент | Файлов | Тестов | Статус |
|-----------|--------|--------|--------|
| Backend API (admin) | 1 | 33 | Покрыт |
| Backend API (buyers) | 1 | 31 | Покрыт |
| Backend API (seller_web) | 1 | 33 | Покрыт |
| Backend API (auth) | 1 | 18 | Покрыт |
| Backend API (orders) | 1 | 20 | Покрыт |
| Backend API (public) | 1 | 23 | Покрыт |
| Backend API (sellers) | 1 | 16 | Покрыт |
| Backend API (integration) | 1 | 4 | Базовое покрытие |
| Backend API (upload) | 1 | 3 | Базовое покрытие |
| Backend Services | 1 | 53 | Покрыт |
| Bot (aiogram) | — | — | Нет тестов |
| Mini App (React) | — | — | Нет тестов |
| Admin Panel (React) | — | — | Нет тестов |

**Итого: ~234 теста** для backend.

---

## 2. Типы тестов в проекте

### 2.1 Unit-тесты сервисов (`test_services.py`)

Тестируют бизнес-логику изолированно от HTTP-слоя. Работают напрямую с SQLAlchemy-сессией и сервисными классами.

**Что покрывают:**
- `BuyerService` — регистрация, профиль, баланс
- `LoyaltyService` — начисление баллов, управление клиентами
- Утилиты паролей (`hash_password`, `verify_password`)
- Валидация паролей (`validate_password_strength`)
- Нормализация телефонов (`normalize_phone`)
- Валидация ИНН
- XSS-санитизация

**Пример:**
```python
@pytest.mark.asyncio
async def test_register_new_buyer(test_session):
    service = BuyerService(test_session)
    user = await service.register(tg_id=111222333, username="newuser")
    assert user.tg_id == 111222333
    assert user.role == "BUYER"
```

### 2.2 API-тесты эндпоинтов

Тестируют HTTP-эндпоинты через `httpx.AsyncClient` с `ASGITransport`. Проверяют статус-коды, формат ответов, авторизацию.

**Файлы:**
- `test_admin.py` — админ-панель (CRUD продавцов, статистика, кэш)
- `test_buyers.py` — покупатели (регистрация, профиль, корзина, избранное, заказы)
- `test_seller_web.py` — веб-панель продавца (профиль, заказы, товары, статистика)
- `test_auth.py` — Telegram WebApp аутентификация
- `test_orders.py` — заказы
- `test_public.py` — публичный каталог
- `test_sellers.py` — продавцы (через бот-API)

**Пример:**
```python
@pytest.mark.asyncio
async def test_seller_login_success(client, test_session, test_seller):
    test_seller.web_login = f"Seller{test_seller.seller_id}"
    test_seller.web_password_hash = hash_password(str(test_seller.seller_id))
    await test_session.commit()

    response = await client.post("/seller-web/login", json={
        "login": f"Seller{test_seller.seller_id}",
        "password": str(test_seller.seller_id),
    })
    assert response.status_code == 200
    assert "token" in response.json()
```

### 2.3 Интеграционные тесты (`test_integration.py`)

Тестируют сквозные сценарии, проходящие через несколько эндпоинтов и сервисов (например, регистрация → добавление в корзину → оформление заказа).

### 2.4 Нагрузочные тесты (`test_load.py`)

Конфигурация для нагрузочного тестирования (используется отдельно от основного pytest-запуска).

---

## 3. Как запускать тесты

### Предварительные требования

```bash
cd backend
pip install -r requirements.txt
pip install pytest pytest-asyncio httpx aiosqlite
```

### Основные команды

```bash
# Все тесты
pytest backend/tests/ -v

# Конкретный файл
pytest backend/tests/test_admin.py -v

# Конкретный тест
pytest backend/tests/test_services.py::test_hash_and_verify_password -v

# По ключевому слову
pytest backend/tests/ -k "login" -v

# С покрытием
pytest backend/tests/ --cov=backend.app --cov-report=term-missing

# Только быстрые unit-тесты сервисов
pytest backend/tests/test_services.py -v

# Только тесты определённого модуля API
pytest backend/tests/test_buyers.py -v
pytest backend/tests/test_admin.py -v
pytest backend/tests/test_seller_web.py -v
```

### Полезные флаги

| Флаг | Назначение |
|------|-----------|
| `-v` | Подробный вывод |
| `-s` | Показывать print/stdout |
| `-x` | Остановиться на первой ошибке |
| `--tb=short` | Короткий traceback |
| `-k "выражение"` | Фильтр по имени теста |
| `--cov` | Отчёт о покрытии |
| `-q` | Тихий режим |

### Запуск в Docker

```bash
docker compose exec backend bash -c "cd /src && pytest backend/tests/ -v"
```

---

## 4. Когда какие тесты использовать

| Этап разработки | Какие тесты запускать | Команда |
|----------------|----------------------|---------|
| Изменил бизнес-логику сервиса | Unit-тесты сервисов | `pytest backend/tests/test_services.py -v` |
| Изменил API-эндпоинт admin | Тесты admin API | `pytest backend/tests/test_admin.py -v` |
| Изменил API покупателей | Тесты buyers API | `pytest backend/tests/test_buyers.py -v` |
| Изменил веб-панель продавца | Тесты seller_web API | `pytest backend/tests/test_seller_web.py -v` |
| Изменил аутентификацию | Тесты auth | `pytest backend/tests/test_auth.py backend/tests/test_seller_web.py -k "token or login or auth" -v` |
| Изменил модели/миграции | Все тесты | `pytest backend/tests/ -v` |
| Перед коммитом | Все тесты | `pytest backend/tests/ -v` |
| Перед деплоем | Все тесты + покрытие | `pytest backend/tests/ --cov=backend.app -v` |

---

## 5. Структура тестов в репозитории

```
backend/
├── tests/
│   ├── conftest.py              # Фикстуры, мок-кэш, тестовая БД, хелперы авторизации
│   │
│   ├── test_services.py         # 53 теста — unit-тесты бизнес-логики
│   │   ├── BuyerService (get, register, update, balance)
│   │   ├── LoyaltyService (points, customers, accrual)
│   │   ├── Phone normalization (7 форматов)
│   │   ├── Password utils (hash, verify)
│   │   ├── Password validation (strength rules)
│   │   ├── XSS sanitization
│   │   ├── INN validation
│   │   └── Referral commissions
│   │
│   ├── test_admin.py            # 33 теста — Admin Panel API
│   │   ├── Admin login (success, wrong password, wrong login)
│   │   ├── Reference data (cities, districts)
│   │   ├── Seller management (CRUD, block, delete, restore)
│   │   ├── Web credentials
│   │   ├── Statistics
│   │   ├── Cache invalidation
│   │   └── Token validation
│   │
│   ├── test_buyers.py           # 31 тест — Buyer API
│   │   ├── Registration (new, existing, referral)
│   │   ├── Profile (get, update, phone validation)
│   │   ├── Cart (CRUD, checkout)
│   │   ├── Favorites (sellers, products)
│   │   └── Orders (list, confirm received)
│   │
│   ├── test_seller_web.py       # 33 теста — Seller Web Panel API
│   │   ├── Seller login (JWT)
│   │   ├── Token validation (expired, blocked, deleted)
│   │   ├── Profile /me (get, update)
│   │   ├── Orders (list, accept, reject, status, price)
│   │   ├── Products CRUD
│   │   ├── Stats & CSV export
│   │   ├── Dashboard alerts
│   │   └── Limits update
│   │
│   ├── test_auth.py             # 18 тестов — Telegram WebApp Auth
│   ├── test_orders.py           # 20 тестов — Orders API
│   ├── test_public.py           # 23 теста — Public catalog API
│   ├── test_sellers.py          # 16 тестов — Sellers (bot API)
│   ├── test_integration.py      # 4 теста — сквозные сценарии
│   ├── test_upload_banner.py    # 3 теста — загрузка баннеров
│   └── test_load.py             # Нагрузочное тестирование
```

### conftest.py — ключевые фикстуры

| Фикстура | Описание |
|----------|----------|
| `test_session` | Async SQLAlchemy сессия (SQLite in-memory, пересоздаётся на каждый тест) |
| `client` | `httpx.AsyncClient` с подменой зависимостей (БД + кэш) |
| `mock_cache` | `MockCacheService` — замена Redis для тестов |
| `test_user` | Покупатель (tg_id=123456789) |
| `test_seller_user` | Пользователь-продавец (tg_id=987654321) |
| `test_seller` | Профиль продавца (shop_name="Test Shop") |
| `test_product` | Товар (price=100.00) |
| `test_order` | Заказ (status="pending") |
| `test_city` / `test_district` / `test_metro` | Справочные данные |
| `auth_header` | Telegram WebApp init data для авторизации покупателя |

### Хелперы авторизации

```python
# Telegram WebApp auth (для покупателей)
auth_header = {"X-Telegram-Init-Data": generate_telegram_init_data(user_id=123)}

# Admin auth
admin_headers = {"X-Admin-Token": "test_admin_secret"}

# Seller JWT auth
seller_headers = {"X-Seller-Token": create_seller_jwt(seller_id=987)}
```

---

## 6. Примеры из проекта

### Пример 1: Тест регистрации покупателя через API

```python
# backend/tests/test_buyers.py

@pytest.mark.asyncio
async def test_register_new_buyer(client, auth_header, test_user):
    """Регистрация нового покупателя через API."""
    response = await client.post("/buyers/register", headers=auth_header)
    assert response.status_code == 200
    data = response.json()
    assert data["tg_id"] == test_user.tg_id
    assert data["role"] == "BUYER"
```

### Пример 2: Unit-тест нормализации телефона

```python
# backend/tests/test_services.py

def test_normalize_phone_8_prefix():
    """8-ка в начале заменяется на +7."""
    from backend.app.services.buyers import normalize_phone
    assert normalize_phone("89001234567") == "+79001234567"

def test_normalize_phone_plus7():
    """Телефон с +7 остаётся без изменений."""
    assert normalize_phone("+79001234567") == "+79001234567"
```

### Пример 3: Тест авторизации продавца (JWT)

```python
# backend/tests/test_seller_web.py

@pytest.mark.asyncio
async def test_seller_endpoint_expired_token(client, test_seller):
    """Запрос с просроченным JWT должен вернуть 401."""
    payload = {
        "sub": str(test_seller.seller_id),
        "role": "seller",
        "exp": datetime.utcnow() - timedelta(hours=1),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    response = await client.get(
        "/seller-web/me",
        headers={"X-Seller-Token": token},
    )
    assert response.status_code == 401
```

### Пример 4: Тест CRUD товаров продавца

```python
# backend/tests/test_seller_web.py

@pytest.mark.asyncio
async def test_seller_add_product(client, test_seller):
    """Добавление нового товара через веб-панель."""
    response = await client.post(
        "/seller-web/products",
        json={
            "seller_id": test_seller.seller_id,
            "name": "New Product",
            "price": 199.99,
            "quantity": 10,
        },
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
```

### Пример 5: Тест валидации пароля

```python
# backend/tests/test_services.py

def test_password_too_short():
    """Пароль короче 6 символов не проходит валидацию."""
    from backend.app.core.password_validation import validate_password_strength
    ok, msg = validate_password_strength("Ab1")
    assert not ok

def test_password_no_uppercase():
    """Пароль без заглавных букв не проходит валидацию."""
    ok, msg = validate_password_strength("abcdef1")
    assert not ok
```

### Пример 6: Тест кэш-инвалидации (admin)

```python
# backend/tests/test_admin.py

@pytest.mark.asyncio
async def test_admin_cache_invalidate_all(client, mock_cache):
    """Инвалидация всего кэша через admin API."""
    await mock_cache.set("cities:all", [{"id": 1}])
    response = await client.post(
        "/admin/cache/invalidate",
        params={"type": "all"},
        headers={"X-Admin-Token": "test_admin_secret"},
    )
    assert response.status_code == 200
```

---

## 7. Рекомендации

### 7.1 Для backend

**Написание новых тестов:**
- Используйте существующие фикстуры из `conftest.py`
- Всегда помечайте async-тесты декоратором `@pytest.mark.asyncio`
- Проверяйте как успешные сценарии, так и ошибки (401, 403, 404, 422)
- Для тестов авторизации используйте готовые хелперы (`auth_header`, `seller_headers`, admin token)

**Паттерн для нового API-теста:**
```python
@pytest.mark.asyncio
async def test_my_new_endpoint(client: AsyncClient, test_seller: Seller):
    response = await client.get(
        "/my-endpoint",
        headers=seller_headers(test_seller.seller_id),
    )
    assert response.status_code == 200
    data = response.json()
    # Проверяйте структуру ответа
    assert "expected_field" in data
```

**Паттерн для unit-теста сервиса:**
```python
@pytest.mark.asyncio
async def test_my_service_method(test_session: AsyncSession):
    service = MyService(test_session)
    result = await service.my_method(param=value)
    assert result is not None
```

**Что тестировать в первую очередь:**
1. Новые API-эндпоинты (happy path + ошибки)
2. Бизнес-логику с расчётами (цены, баллы, лимиты)
3. Авторизацию и доступ (роли, блокировки)
4. Валидацию входных данных (телефоны, ИНН, пароли)
5. Граничные случаи (пустые данные, нулевые значения, дубликаты)

### 7.2 Для Telegram-бота

Бот (aiogram 3.x) в текущей конфигурации не покрыт тестами. Для добавления тестов рекомендуется:

1. **Установить зависимости:**
   ```bash
   pip install aiogram pytest-aiogram
   ```

2. **Выделить бизнес-логику из хэндлеров** в отдельные сервисные функции, которые можно тестировать изолированно.

3. **Мокировать Telegram API:**
   ```python
   from unittest.mock import AsyncMock

   async def test_start_handler():
       message = AsyncMock()
       message.from_user.id = 123456
       await start_handler(message)
       message.answer.assert_called_once()
   ```

4. **Приоритетные хэндлеры для тестирования:**
   - `bot/handlers/start.py` — регистрация, приветствие
   - `bot/handlers/buyer.py` — основной поток покупателя
   - `bot/handlers/seller.py` — работа продавца через бота

### 7.3 Для фронтенда (Mini App и Admin Panel)

Фронтенд-проекты не имеют тестовой инфраструктуры. Рекомендации:

1. **Установить тестовый фреймворк:**
   ```bash
   cd miniapp  # или adminpanel
   npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
   ```

2. **Добавить конфигурацию в `vite.config.ts`:**
   ```typescript
   export default defineConfig({
     test: {
       globals: true,
       environment: 'jsdom',
       setupFiles: './src/setupTests.ts',
     },
   });
   ```

3. **Приоритет тестирования:**
   - Утилитарные функции (форматирование цен, дат)
   - API-клиент (мок fetch, проверка URL и параметров)
   - Ключевые компоненты (каталог, корзина, оформление заказа)
   - Формы с валидацией

4. **Пример теста компонента:**
   ```tsx
   import { render, screen } from '@testing-library/react';
   import { ProductCard } from './ProductCard';

   test('renders product name and price', () => {
     render(<ProductCard name="Розы" price={1500} />);
     expect(screen.getByText('Розы')).toBeInTheDocument();
     expect(screen.getByText('1 500 ₽')).toBeInTheDocument();
   });
   ```

### 7.4 Общие рекомендации

- **Запускайте тесты перед каждым коммитом** — это предотвращает регрессии
- **Пишите тесты вместе с кодом** — не откладывайте на потом
- **Один тест — один сценарий** — не смешивайте проверки
- **Используйте говорящие имена** — `test_seller_login_wrong_password`, а не `test_login_2`
- **Проверяйте негативные сценарии** — ошибки авторизации, невалидные данные, несуществующие объекты
- **Не тестируйте фреймворк** — тестируйте свою бизнес-логику
- **Следите за изоляцией** — каждый тест должен работать независимо (свежая БД на каждый тест)

---

## Приложение: Быстрый старт

```bash
# 1. Установить зависимости
cd backend
pip install -r requirements.txt
pip install pytest pytest-asyncio httpx aiosqlite pytest-cov

# 2. Запустить все тесты
pytest tests/ -v

# 3. Запустить с покрытием
pytest tests/ --cov=backend.app --cov-report=term-missing

# 4. Запустить конкретную категорию
pytest tests/test_services.py -v    # unit-тесты
pytest tests/test_admin.py -v       # admin API
pytest tests/test_buyers.py -v      # buyer API
pytest tests/test_seller_web.py -v  # seller web panel
```

---

*Последнее обновление: 2025-02-15*
*Общее количество тестов: ~234*
