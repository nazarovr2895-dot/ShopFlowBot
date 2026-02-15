# Запуск тестов на сервере

## Первый раз (установка зависимостей)

```bash
cd ~/shopflowbot/backend

# Создать виртуальное окружение
python3 -m venv venv

# Активировать и установить зависимости
source venv/bin/activate
pip install -r requirements.txt
```

## Запуск тестов

```bash
cd ~/shopflowbot
source backend/venv/bin/activate

# Все новые тесты (150 штук)
pytest backend/tests/test_admin.py backend/tests/test_buyers.py backend/tests/test_seller_web.py backend/tests/test_services.py -v

# Только unit-тесты сервисов (53 теста)
pytest backend/tests/test_services.py -v

# Только API-тесты admin (33 теста)
pytest backend/tests/test_admin.py -v

# Только API-тесты buyers (31 тест)
pytest backend/tests/test_buyers.py -v

# Только API-тесты seller_web (33 теста)
pytest backend/tests/test_seller_web.py -v

# Все тесты backend (кроме нагрузочных)
pytest backend/tests/ --ignore=backend/tests/test_load.py -v

# Тесты с покрытием
pytest backend/tests/test_services.py backend/tests/test_admin.py backend/tests/test_buyers.py backend/tests/test_seller_web.py --cov=backend.app --cov-report=term-missing
```

## Известные проблемы

9 старых тестов (test_auth, test_orders, test_public, test_integration) имеют pre-existing failures:
- Seller capacity validation (409 Conflict)
- Date field serialization bug
- AsyncClient API changes

Эти ошибки существовали ДО добавления новых тестов.

**Все 150 новых тестов работают корректно!**
