# Тестирование

## Типы тестов

### 1. Unit тесты

Тесты отдельных функций и классов.

```bash
pytest backend/tests/test_auth.py -v
```

### 2. Integration тесты

Тесты взаимодействия компонентов системы.

```bash
pytest backend/tests/test_integration.py -v
```

### 3. Load тесты

Нагрузочное тестирование для проверки производительности.

#### Использование Locust

```bash
# Установка
pip install locust

# Запуск
locust -f backend/tests/test_load.py --host=http://localhost:8000

# Запуск с параметрами
locust -f backend/tests/test_load.py \
  --host=http://localhost:8000 \
  --users 100 \
  --spawn-rate 10 \
  --run-time 5m
```

#### Использование k6

```bash
# Установка
brew install k6  # macOS
# или скачать с https://k6.io/

# Запуск
k6 run backend/tests/k6_load_test.js
```

### 4. E2E тесты

End-to-end тесты для проверки полных пользовательских сценариев.

## Покрытие кода

Проверка покрытия тестами:

```bash
pytest --cov=backend/app --cov-report=html --cov-report=term
```

Целевое покрытие: минимум 70%

## Нагрузочное тестирование

### Сценарии для тестирования

1. **Просмотр каталога продавцов**
   - 1000 одновременных пользователей
   - Целевой RPS: 500 req/s
   - Целевая latency: p95 < 200ms

2. **Создание заказов**
   - 100 одновременных пользователей
   - Целевой RPS: 50 req/s
   - Целевая latency: p95 < 500ms

3. **Админ-панель**
   - 10 одновременных администраторов
   - Целевой RPS: 20 req/s
   - Целевая latency: p95 < 300ms

### Критерии успеха

- **Availability**: 99.9% uptime
- **Response time**: p95 < 500ms, p99 < 1s
- **Error rate**: < 0.1%
- **Throughput**: способность обработать ожидаемую нагрузку

## CI/CD интеграция

### GitHub Actions пример

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Set up Python
        uses: actions/setup-python@v2
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install -r backend/requirements.txt
          pip install pytest pytest-cov pytest-asyncio httpx
      - name: Run tests
        run: |
          pytest backend/tests/ --cov=backend/app --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

## Тестирование безопасности

### Проверки

1. **Rate limiting**
   - Проверить ограничение на login endpoints
   - Проверить общий rate limiting

2. **Аутентификация**
   - Проверить валидацию токенов
   - Проверить защиту эндпоинтов

3. **Валидация входных данных**
   - Проверить санитизацию пользовательского ввода
   - Проверить валидацию файлов

4. **SQL Injection**
   - Проверить защиту от SQL injection
   - Использовать инструменты типа SQLMap

5. **XSS**
   - Проверить защиту от XSS атак
   - Проверить санитизацию HTML

## Рекомендации

1. **Автоматизация**
   - Запускать тесты при каждом коммите
   - Блокировать merge при падении тестов

2. **Регулярное тестирование**
   - Еженедельное нагрузочное тестирование
   - Ежемесячное тестирование безопасности

3. **Мониторинг в production**
   - Отслеживать метрики производительности
   - Настраивать алерты при деградации
