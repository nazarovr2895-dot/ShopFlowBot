# Скрипты

## load_metro_stations.py

Скрипт для загрузки станций метро Москвы в базу данных.

### Применение изменений (пошагово)

**1. Убедитесь, что Docker и БД запущены:**
```bash
docker compose up -d db
```

**2. Выполните миграции** (если ещё не выполняли):
```bash
python run_migrations.py
```

**3. При необходимости создайте города и районы** (для пустой БД):
```bash
python reset_db.py
```
⚠️ Внимание: `reset_db.py` удалит все данные (sellers, orders, products, metro_stations и т.д.)

**4. Загрузите станции метро:**
```bash
# Активируйте venv (обязательно!)
source venv/bin/activate

# Проверка без записи в БД
python scripts/load_metro_stations.py scripts/data/metro_stations_sample.json --dry-run

# Реальная загрузка
python scripts/load_metro_stations.py scripts/data/metro_stations_sample.json
```

**5. Проверьте работу:**

- Запустите backend: `docker compose up -d backend` (или локально)
- Поиск метро: `curl "http://localhost:8000/public/metro/search?q=Академическая"`
- Или откройте Mini App и проверьте фильтр по метро

### Если в БД уже есть станции метро (перезагрузка)

Используйте флаг `--replace` — он очистит таблицу и загрузит данные заново:
```bash
source venv/bin/activate
python scripts/load_metro_stations.py scripts/data/metro_stations_sample.json --replace
```
⚠️ При этом у всех продавцов сбросится `metro_id` (привязка к метро).

### Требования

- Python 3.10+ с зависимостями: `pip install -r requirements.txt`
- Файл `.env` с настройками БД (DB_USER, DB_PASSWORD, DB_NAME, DB_HOST, DB_PORT)

### Формат данных

| Поле        | Обязательно | Описание                              |
|-------------|-------------|---------------------------------------|
| name        | да          | Название станции                      |
| district_id | да          | ID района (1–12 для Москвы)           |
| line_color  | нет         | HEX цвет линии (например, `#FF0000`)  |

### Пример CSV

```csv
name,district_id,line_color
Академическая,7,#f6990e
Александровский сад,1,#52d2f4
```
