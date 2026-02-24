# TDD Guide — Test-Driven Development для Flurai

> Руководство по написанию тестов для новых функций. Следуйте этим правилам при добавлении любой новой функциональности.

---

## 🎯 Основной принцип: Red → Green → Refactor

**ВСЕГДА пишите тесты ДО написания кода функции!**

```
1. 🔴 RED:    Напишите тест, который падает (функция ещё не реализована)
2. 🟢 GREEN:  Напишите минимальный код, чтобы тест прошёл
3. 🔵 REFACTOR: Улучшите код, не ломая тесты
```

---

## 📋 Обязательные правила

### ✅ Правило 1: Тест перед кодом

**ЗАПРЕЩЕНО** писать код без теста!

```python
# ❌ НЕПРАВИЛЬНО
# 1. Написал функцию
def calculate_discount(price: float, percent: int) -> float:
    return price * (1 - percent / 100)

# 2. Потом написал тест
def test_calculate_discount():
    assert calculate_discount(100, 10) == 90.0
```

```python
# ✅ ПРАВИЛЬНО
# 1. СНАЧАЛА пишем тест
def test_calculate_discount():
    # Тест упадёт, т.к. функции ещё нет
    assert calculate_discount(100, 10) == 90.0
    assert calculate_discount(100, 0) == 100.0
    assert calculate_discount(100, 100) == 0.0

# 2. Запускаем тест - он падает (RED)
# pytest tests/test_discounts.py::test_calculate_discount

# 3. ТЕПЕРЬ пишем функцию
def calculate_discount(price: float, percent: int) -> float:
    if not 0 <= percent <= 100:
        raise ValueError("Percent must be 0-100")
    return price * (1 - percent / 100)

# 4. Запускаем тест - он проходит (GREEN)
# 5. Рефакторим при необходимости (REFACTOR)
```

---

### ✅ Правило 2: Тестируйте ВСЕ новые эндпоинты

При добавлении нового API endpoint **ОБЯЗАТЕЛЬНО** пишите минимум 5 тестов:

1. ✅ **Happy path** (успешный сценарий)
2. ❌ **Ошибка валидации** (неверные данные)
3. 🔒 **Ошибка авторизации** (нет токена / неверный токен)
4. 🚫 **Ошибка доступа** (403 Forbidden)
5. 🔍 **Объект не найден** (404 Not Found)

**Пример:**

```python
# backend/app/api/promotions.py
@router.post("/promotions")
async def create_promotion(
    data: PromotionCreate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    # Код функции
    pass
```

```python
# backend/tests/test_promotions.py

@pytest.mark.asyncio
async def test_create_promotion_success(client, seller_headers, test_seller):
    """1. Happy path - создание акции"""
    response = await client.post("/promotions", json={
        "title": "Скидка 20%",
        "discount_percent": 20,
        "valid_until": "2025-12-31",
    }, headers=seller_headers(test_seller.seller_id))

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Скидка 20%"
    assert data["discount_percent"] == 20

@pytest.mark.asyncio
async def test_create_promotion_invalid_data(client, seller_headers, test_seller):
    """2. Ошибка валидации - неверный процент"""
    response = await client.post("/promotions", json={
        "title": "Скидка",
        "discount_percent": 150,  # > 100
    }, headers=seller_headers(test_seller.seller_id))

    assert response.status_code == 422

@pytest.mark.asyncio
async def test_create_promotion_no_auth(client):
    """3. Нет авторизации"""
    response = await client.post("/promotions", json={
        "title": "Скидка 20%",
        "discount_percent": 20,
    })

    assert response.status_code == 401

@pytest.mark.asyncio
async def test_create_promotion_blocked_seller(client, seller_headers, test_seller, test_session):
    """4. Заблокированный продавец"""
    test_seller.is_blocked = True
    await test_session.commit()

    response = await client.post("/promotions", json={
        "title": "Скидка 20%",
        "discount_percent": 20,
    }, headers=seller_headers(test_seller.seller_id))

    assert response.status_code == 403

@pytest.mark.asyncio
async def test_update_promotion_not_found(client, seller_headers, test_seller):
    """5. Акция не найдена"""
    response = await client.put("/promotions/999999", json={
        "title": "Новое название",
    }, headers=seller_headers(test_seller.seller_id))

    assert response.status_code == 404
```

---

### ✅ Правило 3: Unit-тесты для бизнес-логики

Любая функция с расчётами, валидацией, трансформацией данных **ДОЛЖНА** иметь unit-тест.

**Примеры функций, требующих unit-тестов:**
- Расчёты (цены, скидки, комиссии, баллы лояльности)
- Валидация (телефоны, email, ИНН, пароли)
- Форматирование (даты, числа, текст)
- Бизнес-правила (лимиты, квоты, доступность)

**Пример:**

```python
# backend/app/services/promotions.py

def calculate_promo_price(original_price: float, discount_percent: int) -> float:
    """Рассчитать цену со скидкой."""
    if discount_percent < 0 or discount_percent > 100:
        raise ValueError("Discount must be 0-100")

    discount_amount = original_price * (discount_percent / 100)
    final_price = original_price - discount_amount

    return round(final_price, 2)
```

```python
# backend/tests/test_services.py

class TestPromotionCalculations:
    """Unit-тесты расчётов акций"""

    def test_calculate_promo_price_10_percent(self):
        assert calculate_promo_price(100.0, 10) == 90.0

    def test_calculate_promo_price_50_percent(self):
        assert calculate_promo_price(200.0, 50) == 100.0

    def test_calculate_promo_price_no_discount(self):
        assert calculate_promo_price(100.0, 0) == 100.0

    def test_calculate_promo_price_full_discount(self):
        assert calculate_promo_price(100.0, 100) == 0.0

    def test_calculate_promo_price_rounding(self):
        assert calculate_promo_price(99.99, 33) == 66.99

    def test_calculate_promo_price_negative_percent(self):
        with pytest.raises(ValueError, match="Discount must be 0-100"):
            calculate_promo_price(100.0, -10)

    def test_calculate_promo_price_over_100_percent(self):
        with pytest.raises(ValueError, match="Discount must be 0-100"):
            calculate_promo_price(100.0, 150)
```

---

### ✅ Правило 4: Тестируйте edge cases

**ВСЕГДА** проверяйте граничные случаи:

- ✅ Пустые значения (`None`, `""`, `[]`, `{}`)
- ✅ Нулевые значения (`0`, `0.0`)
- ✅ Отрицательные значения
- ✅ Очень большие значения
- ✅ Невалидные типы данных
- ✅ Дубликаты
- ✅ Конфликты (409)

**Пример:**

```python
def test_create_user_empty_name(client):
    """Пустое имя должно вернуть 422"""
    response = client.post("/users", json={"name": "", "email": "test@test.com"})
    assert response.status_code == 422

def test_create_user_duplicate_email(client, test_user):
    """Дубликат email должен вернуть 409"""
    response = client.post("/users", json={
        "name": "New User",
        "email": test_user.email,  # уже существует
    })
    assert response.status_code == 409

def test_update_balance_negative(client):
    """Нельзя установить отрицательный баланс"""
    response = client.put("/users/1/balance", json={"amount": -100})
    assert response.status_code == 422
```

---

### ✅ Правило 5: Один тест = один сценарий

**ЗАПРЕЩЕНО** смешивать несколько проверок в одном тесте.

```python
# ❌ НЕПРАВИЛЬНО
def test_user_crud(client):
    # Создание
    create_response = client.post("/users", json={"name": "Test"})
    assert create_response.status_code == 200

    # Чтение
    get_response = client.get("/users/1")
    assert get_response.status_code == 200

    # Обновление
    update_response = client.put("/users/1", json={"name": "Updated"})
    assert update_response.status_code == 200

    # Удаление
    delete_response = client.delete("/users/1")
    assert delete_response.status_code == 204
```

```python
# ✅ ПРАВИЛЬНО
def test_create_user(client):
    response = client.post("/users", json={"name": "Test"})
    assert response.status_code == 200

def test_get_user(client, test_user):
    response = client.get(f"/users/{test_user.id}")
    assert response.status_code == 200

def test_update_user(client, test_user):
    response = client.put(f"/users/{test_user.id}", json={"name": "Updated"})
    assert response.status_code == 200

def test_delete_user(client, test_user):
    response = client.delete(f"/users/{test_user.id}")
    assert response.status_code == 204
```

---

### ✅ Правило 6: Используйте фикстуры

Не дублируйте код создания тестовых данных — используйте фикстуры.

```python
# ❌ НЕПРАВИЛЬНО
def test_order_total():
    # Дублируем создание продавца
    seller = Seller(seller_id=1, shop_name="Test")
    product = Product(product_id=1, seller_id=1, price=100)
    # ...

def test_order_discount():
    # Снова дублируем
    seller = Seller(seller_id=1, shop_name="Test")
    product = Product(product_id=1, seller_id=1, price=100)
    # ...
```

```python
# ✅ ПРАВИЛЬНО
# conftest.py
@pytest.fixture
async def test_seller(test_session):
    seller = Seller(seller_id=1, shop_name="Test")
    test_session.add(seller)
    await test_session.commit()
    return seller

@pytest.fixture
async def test_product(test_session, test_seller):
    product = Product(product_id=1, seller_id=test_seller.seller_id, price=100)
    test_session.add(product)
    await test_session.commit()
    return product

# test_orders.py
def test_order_total(test_product):
    # Фикстура создаёт всё автоматически
    assert test_product.price == 100

def test_order_discount(test_product):
    # Переиспользуем фикстуру
    assert test_product.price == 100
```

---

## 🔄 Workflow для новой функции

### Шаг 1: Анализ задачи

Перед написанием кода ответьте на вопросы:

1. Какие входные данные?
2. Какие выходные данные?
3. Какие ошибки могут возникнуть?
4. Какие edge cases существуют?
5. Нужна ли авторизация?

### Шаг 2: Создайте тестовый файл

```bash
# Для нового API endpoint
touch backend/tests/test_my_feature.py

# Для новой функции сервиса
# Добавьте тесты в backend/tests/test_services.py
```

### Шаг 3: Напишите тесты (RED)

```python
# backend/tests/test_my_feature.py

@pytest.mark.asyncio
async def test_my_new_endpoint_success(client):
    """Тест должен упасть, т.к. endpoint ещё не существует"""
    response = await client.get("/my-endpoint")
    assert response.status_code == 200
    assert "expected_field" in response.json()
```

### Шаг 4: Запустите тесты — они должны упасть

```bash
pytest backend/tests/test_my_feature.py -v
# FAILED - это ПРАВИЛЬНО!
```

### Шаг 5: Напишите код (GREEN)

```python
# backend/app/api/my_feature.py

@router.get("/my-endpoint")
async def my_new_endpoint():
    return {"expected_field": "value"}
```

### Шаг 6: Запустите тесты — они должны пройти

```bash
pytest backend/tests/test_my_feature.py -v
# PASSED - отлично!
```

### Шаг 7: Добавьте больше тестов

Напишите тесты для:
- Ошибок валидации
- Ошибок авторизации
- Edge cases
- Граничных значений

### Шаг 8: Рефакторинг (REFACTOR)

Улучшите код, не ломая тесты.

```bash
# После каждого изменения проверяйте
pytest backend/tests/test_my_feature.py -v
```

---

## 📊 Контрольный список перед коммитом

Перед `git commit` убедитесь:

- [ ] ✅ Все новые функции покрыты тестами
- [ ] ✅ Тесты написаны ДО кода (TDD)
- [ ] ✅ Проверены edge cases
- [ ] ✅ Проверены ошибки (401, 403, 404, 422, 409)
- [ ] ✅ Используются фикстуры (не дублируется код)
- [ ] ✅ Один тест = один сценарий
- [ ] ✅ Все тесты проходят локально
- [ ] ✅ Добавлены docstring к тестам

**Команда для проверки:**

```bash
# Запустить все тесты
pytest backend/tests/ --ignore=backend/tests/test_load.py -v

# Запустить только новые тесты
pytest backend/tests/test_my_feature.py -v

# Проверить покрытие
pytest backend/tests/ --cov=backend.app --cov-report=term-missing
```

---

## 🎓 Примеры из проекта

### Пример 1: Новый API endpoint для акций

```python
# 1. СНАЧАЛА тест (RED)
@pytest.mark.asyncio
async def test_get_active_promotions(client, test_seller):
    response = await client.get(f"/sellers/{test_seller.seller_id}/promotions")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

# 2. Запускаем - FAILED (endpoint не существует)

# 3. Пишем код (GREEN)
@router.get("/sellers/{seller_id}/promotions")
async def get_active_promotions(seller_id: int, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Promotion).where(Promotion.seller_id == seller_id, Promotion.is_active == True)
    )
    return result.scalars().all()

# 4. Запускаем - PASSED
```

### Пример 2: Новая функция сервиса

```python
# 1. СНАЧАЛА тест (RED)
def test_format_phone_number():
    assert format_phone_number("89001234567") == "+7 (900) 123-45-67"
    assert format_phone_number("+79001234567") == "+7 (900) 123-45-67"
    assert format_phone_number("9001234567") == "+7 (900) 123-45-67"

# 2. Запускаем - FAILED (функции нет)

# 3. Пишем функцию (GREEN)
def format_phone_number(phone: str) -> str:
    clean = phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if clean.startswith("8"):
        clean = "7" + clean[1:]
    if not clean.startswith("7"):
        clean = "7" + clean

    return f"+7 ({clean[1:4]}) {clean[4:7]}-{clean[7:9]}-{clean[9:11]}"

# 4. Запускаем - PASSED
```

---

## 🚀 Автоматизация

### Pre-commit hook

Тесты запускаются автоматически перед каждым коммитом (см. `.git/hooks/pre-commit`).

### CI/CD

Тесты запускаются автоматически:
- При `git push` (GitHub Actions)
- При деплое (deploy.sh)

**Если хотя бы один тест падает — деплой отменяется!**

---

## 📚 Полезные ресурсы

- [backend/tests/conftest.py](./backend/tests/conftest.py) — фикстуры
- [pytest документация](https://docs.pytest.org/)
- [pytest-asyncio](https://pytest-asyncio.readthedocs.io/)

---

**Помните: Код без тестов = технический долг!**

*Последнее обновление: 2025-02-15*
