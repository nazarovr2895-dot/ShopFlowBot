# Скрипты

## Один туннель Loophole (рекомендуется)

Один туннель на порт **3000**: фронт и API идут через один URL, **Vite dev** проксирует запросы к бэкенду. Стабильнее, чем два туннеля.

**Важно:** при одном туннеле на 3000 должен работать **Vite dev** (`npm run dev`), а не Docker miniapp. По умолчанию `docker compose up -d` **не** поднимает miniapp (у него профиль `miniapp`), поэтому порт 3000 свободен для Vite. Если miniapp уже запущен — останови: `docker compose stop miniapp`.

**1. Запусти бэкенд** (Docker или локально на порту 8000):

```bash
docker compose up -d backend
# или локально: uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

**2. Запусти фронт в dev-режиме** (порт 3000):

```bash
cd miniapp && npm run dev
```

**3. Запусти один туннель:**

```bash
loophole http 3000
```

Скопируй выданный URL (например `https://86ffc94d....loophole.site`).

**4. В корневом `.env`** укажи этот URL:

```env
MINI_APP_URL=https://ТВОЙ_URL.loophole.site
ALLOWED_ORIGINS=https://ТВОЙ_URL.loophole.site,http://127.0.0.1:3000,http://localhost:3000
```

**5. В `miniapp/.env`** оставь `VITE_API_URL=` пустым (уже так).

Готово: открывай мини-приложение по `MINI_APP_URL` в Telegram. Запросы к API идут на тот же origin, Vite проксирует их на `localhost:8000`.

---

## Docker Compose и miniapp

- **`docker compose up -d`** — поднимает только db, redis, backend. Miniapp **не** запускается (профиль `miniapp`), порт 3000 свободен для Vite при одном туннеле.
- **`docker compose --profile miniapp up -d`** — поднимает всё, включая miniapp (nginx на 3000). Используй для двух туннелей или когда нужна собранная мини-приложение из Docker.

---

## Два туннеля Loophole (фронт 3000 + бэкенд 8000)

Чтобы развести фронт и бэкенд по разным туннелям:

**1. Запусти все сервисы, включая miniapp:** `docker compose --profile miniapp up -d` (или сначала `docker compose up -d`, затем `docker compose --profile miniapp up -d`).

**2. Запусти туннели** (в одном терминале — оба в фоне):

```bash
./scripts/run-two-tunnels.sh
```

Или вручную в двух терминалах:

- Терминал 1: `~/Downloads/loophole-cli_1.0.0-beta.15_macos_arm64/loophole http 8000` → скопируй **URL бэкенда**
- Терминал 2: `~/Downloads/loophole-cli_1.0.0-beta.15_macos_arm64/loophole http 3000` → скопируй **URL фронта**

**3. В корневом `.env`** укажи URL **фронта** (тот, что на 3000):

```env
MINI_APP_URL=https://XXXX.loophole.site
ALLOWED_ORIGINS=https://XXXX.loophole.site
```

**4. В `miniapp/.env`** укажи URL **бэкенда** (тот, что на 8000):

```env
VITE_API_URL=https://YYYY.loophole.site
```

**5. Перезапусти фронт** (`npm run dev` в `miniapp/`) или пересобери образ miniapp, чтобы подхватился `VITE_API_URL`.  
Если отдаёшь собранный билд (`npm run build` + nginx/статика) — **пересобери** после смены `miniapp/.env`: `VITE_API_URL` подставляется при сборке.

**Если в консоли всё равно видишь запросы на `http://localhost:8000`** — скорее всего открыт **собранный** билд (Docker или `dist/`), а не dev. Тогда:

- **Локальный билд:** пересобери фронт после правки `miniapp/.env`: `cd miniapp && npm run build`, затем отдавай новый `dist/`.
- **Docker:** в корневом `.env` задай `MINIAPP_API_URL=https://ТВОЙ_БЭКЕНД_ТУННЕЛЬ.loophole.site`, затем пересобери образ: `docker compose build miniapp --no-cache && docker compose up -d miniapp`.
- **Без пересборки:** в мини-приложении поддерживается **runtime** URL бэкенда. Отредактируй `miniapp/public/config.json` — укажи `"apiUrl": "https://ТВОЙ_БЭКЕНД_ТУННЕЛЬ.loophole.site"`, пересобери один раз (`npm run build`), дальше при смене туннеля достаточно менять только `config.json` и перезаливать его рядом с билдом (или пересобирать только если отдаёшь весь `dist/`).

---

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
