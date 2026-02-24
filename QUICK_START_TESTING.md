# Quick Start — Быстрый старт с тестированием

> Минимальный набор команд для начала работы с автоматизированным тестированием

---

## 🚀 Установка (один раз)

```bash
# 1. Установить Git hooks (автозапуск тестов перед коммитом)
./scripts/install-hooks.sh

# 2. Создать виртуальное окружение
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..

# Готово! 🎉
```

---

## ✅ Проверка установки

```bash
# Проверить, что hook установлен
ls -la .git/hooks/pre-commit

# Должен вывести:
# -rwxr-xr-x  1 user  staff  2788 Feb 15 12:00 .git/hooks/pre-commit
```

```bash
# Запустить тесты вручную
source backend/venv/bin/activate
pytest backend/tests/test_services.py -v

# Должно быть: 53 passed in X.XXs ✅
```

---

## 🧪 Как писать тесты (TDD)

### 1. Сначала тест (RED)

```python
# backend/tests/test_my_feature.py

@pytest.mark.asyncio
async def test_create_discount(client):
    """Тест создания скидки (упадёт, т.к. endpoint не существует)"""
    response = await client.post("/discounts", json={
        "title": "Скидка 20%",
        "percent": 20,
    })
    assert response.status_code == 200
```

### 2. Запустить тест — должен упасть

```bash
pytest backend/tests/test_my_feature.py -v
# FAILED — это правильно!
```

### 3. Написать код (GREEN)

```python
# backend/app/api/discounts.py

@router.post("/discounts")
async def create_discount(data: DiscountCreate):
    return {"title": data.title, "percent": data.percent}
```

### 4. Запустить тест — должен пройти

```bash
pytest backend/tests/test_my_feature.py -v
# PASSED — отлично!
```

---

## 🔄 Обычный workflow

```bash
# 1. Создать ветку
git checkout -b feature/my-new-feature

# 2. Написать тест
vim backend/tests/test_my_feature.py

# 3. Запустить тест — упадёт (RED)
source backend/venv/bin/activate
pytest backend/tests/test_my_feature.py -v

# 4. Написать код
vim backend/app/api/my_feature.py

# 5. Запустить тест — пройдёт (GREEN)
pytest backend/tests/test_my_feature.py -v

# 6. Коммит (тесты запустятся автоматически!)
git add .
git commit -m "feat: add my feature"
# → Pre-commit hook запускает тесты
# → Если проходят — коммит создаётся
# → Если падают — коммит отменяется

# 7. Push на GitHub
git push origin feature/my-new-feature
# → GitHub Actions запускает тесты
# → Результат видно во вкладке Actions

# 8. Деплой на production
git checkout main
git merge feature/my-new-feature
./deploy.sh "feat: add my feature"
# → Тесты запустятся ещё раз перед деплоем
# → Если падают — деплой отменяется
# → Если проходят — деплой продолжается
```

---

## 📝 Шаблоны тестов

### API endpoint test

```python
@pytest.mark.asyncio
async def test_my_endpoint_success(client, seller_headers, test_seller):
    """Happy path - успешный запрос"""
    response = await client.post("/my-endpoint", json={
        "field": "value",
    }, headers=seller_headers(test_seller.seller_id))

    assert response.status_code == 200
    data = response.json()
    assert data["field"] == "value"

@pytest.mark.asyncio
async def test_my_endpoint_unauthorized(client):
    """Без авторизации - должен вернуть 401"""
    response = await client.post("/my-endpoint", json={
        "field": "value",
    })
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_my_endpoint_invalid_data(client, seller_headers, test_seller):
    """Невалидные данные - должен вернуть 422"""
    response = await client.post("/my-endpoint", json={
        "field": "",  # пустое значение
    }, headers=seller_headers(test_seller.seller_id))
    assert response.status_code == 422
```

### Unit test (сервис)

```python
def test_calculate_something():
    """Тест функции расчёта"""
    result = calculate_something(100, 20)
    assert result == 80

def test_calculate_something_edge_case():
    """Граничный случай - нулевое значение"""
    result = calculate_something(0, 20)
    assert result == 0

def test_calculate_something_invalid():
    """Невалидные данные - должно выбросить исключение"""
    with pytest.raises(ValueError):
        calculate_something(-100, 20)
```

---

## 🛠️ Полезные команды

```bash
# Запустить все новые тесты
pytest backend/tests/test_admin.py \
       backend/tests/test_buyers.py \
       backend/tests/test_seller_web.py \
       backend/tests/test_services.py -v

# Запустить конкретный тест
pytest backend/tests/test_my_feature.py::test_my_function -v

# Запустить тесты по ключевому слову
pytest backend/tests/ -k "login" -v

# Запустить с покрытием
pytest backend/tests/test_services.py --cov=backend.app --cov-report=term-missing

# Остановиться на первой ошибке
pytest backend/tests/ -x

# Показать print() в выводе
pytest backend/tests/ -s
```

---

## 🚨 Что делать при ошибках

### Тесты падают при коммите

```bash
# Вариант 1: Исправить тесты
vim backend/tests/test_my_feature.py
pytest backend/tests/test_my_feature.py -v
git add .
git commit -m "fix: update tests"

# Вариант 2: Пропустить hook (НЕ РЕКОМЕНДУЕТСЯ!)
git commit --no-verify -m "WIP: will fix later"
```

### Тесты падают при деплое

```bash
# Исправить локально
pytest backend/tests/ -v

# После исправления попробовать снова
./deploy.sh "fix: tests fixed"
```

---

## 📚 Полная документация

- **[TDD_GUIDE.md](./TDD_GUIDE.md)** — подробное руководство по TDD
- **[TEST_AUTOMATION.md](./TEST_AUTOMATION.md)** — как работает автоматизация
- **[RUN_TESTS.md](./RUN_TESTS.md)** — запуск тестов на сервере

---

## ✅ Контрольный список

- [ ] Hook установлен (`./scripts/install-hooks.sh`)
- [ ] Venv создан (`cd backend && python3 -m venv venv`)
- [ ] Зависимости установлены (`pip install -r requirements.txt`)
- [ ] Тесты запускаются (`pytest backend/tests/test_services.py -v`)
- [ ] Прочитан TDD_GUIDE.md
- [ ] Понял workflow: RED → GREEN → REFACTOR

---

**Готово! Теперь вы защищены от регрессий. Пишите код с уверенностью! 🛡️**
