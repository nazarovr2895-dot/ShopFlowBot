# Исправление проблемы с отображением изображений товаров

## 🔴 Проблема

Изображения товаров не отображались в Mini App и иногда пропадали после деплоя.

### Симптомы
- Фото работало какое-то время, потом исчезало
- После пересборки контейнеров (deploy) все загруженные фото пропадали
- В некоторых местах фото отображалось, в других - нет

## 🔍 Найденные причины

### 1. Критическая проблема: потеря файлов при пересборке контейнеров

**Что происходило:**
- Загруженные фото сохранялись в `/src/backend/static/uploads/products/` **внутри контейнера**
- При пересборке контейнера (`docker compose build backend`) все файлы удалялись
- В `docker-compose.prod.yml` **не было volume** для сохранения статических файлов

**Когда это проявлялось:**
- После каждого `./deploy.sh` с пересборкой контейнеров
- После команды `docker compose -f docker-compose.prod.yml build backend`
- При любом обновлении кода backend

### 2. Несуществующие файлы в базе данных

**Что происходило:**
- В БД товары ссылались на файлы, которые были удалены при пересборке
- Например: товар ссылается на `b281626a9e864dd49fc8af911cf5281c.webp`, но файла нет

**Почему так получилось:**
- Продавец загрузил фото через админ-панель
- Фото сохранилось в контейнере
- Путь сохранился в БД
- При следующем деплое контейнер пересобрался → файл удалился
- В БД остался путь к несуществующему файлу

## ✅ Решения

### Решение 1: Persistent volume для статических файлов ⭐ (КРИТИЧНО)

**Изменения в `docker-compose.prod.yml`:**

```yaml
services:
  backend:
    # ... остальные настройки ...
    # Persist uploaded product images across container rebuilds
    volumes:
      - static_uploads:/src/backend/static/uploads

volumes:
  pgdata:
  pgdata-replica:
  redis_data:
  static_uploads:  # Persistent storage for uploaded product images
```

**Что это дает:**
- ✅ Загруженные фото НЕ удаляются при пересборке контейнеров
- ✅ Файлы хранятся в Docker volume на хосте
- ✅ При обновлении кода backend файлы остаются

### Решение 2: Nginx проксирование /static/ к backend

**Изменения в `nginx/nginx.prod.conf`:**

Для сервера `api.flurai.ru`:
```nginx
# Static files (product images) - proxy to backend
location /static/ {
    # Проксировать к backend, который раздает через FastAPI StaticFiles
    proxy_pass http://backend;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Кэширование на стороне nginx
    proxy_cache_valid 200 30d;
    proxy_cache_bypass $http_pragma $http_authorization;
    expires 30d;
    add_header Cache-Control "public, immutable";

    # Увеличенный таймаут для больших изображений
    proxy_connect_timeout 10s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
}
```

**Изменения в `miniapp/nginx.conf`:**

```nginx
# Product images: proxy to backend (same network in docker-compose)
location /static/ {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 10s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

**Что это дает:**
- ✅ Изображения доступны через https://api.flurai.ru/static/...
- ✅ Изображения доступны через https://app.flurai.ru/static/...
- ✅ Работает в Telegram Mini App и в браузере
- ✅ Nginx кэширует изображения на 30 дней

### Решение 3: config.json с API URL при сборке

**Изменения в `miniapp/Dockerfile`:**

```dockerfile
# Build argument for API URL
ARG VITE_API_URL
ARG VITE_BOT_USERNAME

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BOT_USERNAME=$VITE_BOT_USERNAME

# Ensure config.json has API URL at build time so production never has empty base
RUN echo "{\"apiUrl\":\"${VITE_API_URL}\"}" > public/config.json

# Build the app
RUN npm run build
```

**Что это дает:**
- ✅ Frontend всегда знает правильный API URL
- ✅ Изображения грузятся с правильного домена (api.flurai.ru)
- ✅ Работает и в Telegram, и в браузере

## 📊 Проверка работоспособности

### 1. Проверка health backend
```bash
curl https://api.flurai.ru/health
```

Ожидаемый ответ:
```json
{"status": "healthy", "version": "1.0.0", "checks": {"database": "ok", "redis": "ok"}}
```

### 2. Проверка доступа к изображениям через api.flurai.ru
```bash
curl -I https://api.flurai.ru/static/uploads/products/509fdc3df38d4f39a60ad9fcf475ef01.webp
```

Ожидаемый ответ:
```
HTTP/2 200
content-type: image/webp
cache-control: max-age=2592000
cache-control: public, immutable
```

### 3. Проверка доступа через app.flurai.ru
```bash
curl -I https://app.flurai.ru/static/uploads/products/509fdc3df38d4f39a60ad9fcf475ef01.webp
```

Ожидаемый ответ:
```
HTTP/2 200
content-type: image/webp
```

### 4. Проверка в браузере

Открыть: https://app.flurai.ru/shop/123456789

**Если фото НЕ загружается:**
1. Открыть DevTools (F12) → Network tab
2. Найти запросы к `/static/uploads/products/...`
3. Проверить статус ответа:
   - **200 OK** → фото должно отображаться
   - **404 Not Found** → файл не существует в backend (проблема с БД)
   - **CORS error** → проблема с nginx конфигурацией

## 🔧 Действия при деплое

### Стандартный деплой (без пересборки контейнеров)

Безопасно! Файлы НЕ удалятся:
```bash
./deploy.sh "описание изменений"
```

Или:
```bash
git push
ssh yandex-cloud "cd ~/flurai && git pull && docker compose -f docker-compose.prod.yml restart backend nginx"
```

### Деплой с пересборкой backend

Теперь безопасно благодаря volume! Файлы НЕ удалятся:
```bash
ssh yandex-cloud "cd ~/flurai && docker compose -f docker-compose.prod.yml build backend && docker compose -f docker-compose.prod.yml up -d backend"
```

### Полная пересборка всех контейнеров

Файлы сохранятся в volume:
```bash
ssh yandex-cloud "cd ~/flurai && docker compose -f docker-compose.prod.yml down && docker compose -f docker-compose.prod.yml up -d"
```

⚠️ **ВАЖНО:** Не используйте `docker compose down -v` (с флагом `-v`) - это удалит все volumes, включая static_uploads!

## 🗂️ Структура хранения файлов

### В Docker volume (production)
```
Docker volume: flurai_static_uploads
├── products/
│   ├── 509fdc3df38d4f39a60ad9fcf475ef01.webp
│   ├── 8cc0a9d9173845eb804e8352ac54e44c.webp
│   └── ... (другие фото товаров)
```

### В контейнере backend
```
/src/backend/static/uploads/  → монтируется из Docker volume
├── products/
│   ├── *.webp, *.jpg, *.png
```

### Проверка volume на хосте
```bash
# Список volumes
docker volume ls | grep static

# Инспектировать volume
docker volume inspect flurai_static_uploads

# Проверить содержимое
docker run --rm -v flurai_static_uploads:/data alpine ls -lh /data/products/
```

## 🚨 Частые проблемы и решения

### Проблема: После деплоя фото пропало

**Причина:** Раньше (до исправления) при пересборке файлы удалялись

**Решение сейчас:** Файлы сохраняются в volume, не удаляются

**Если это все равно происходит:**
1. Проверьте, что volume существует:
   ```bash
   docker volume ls | grep static_uploads
   ```
2. Проверьте, что backend использует volume:
   ```bash
   docker inspect flurai-backend-1 | grep -A5 Mounts
   ```

### Проблема: Товар показывает "нет фото", но файл существует

**Причина:** В БД неправильный путь (не начинается с `/static/`)

**Решение:** Обновить БД через админ-панель или SQL:
```sql
-- Проверить текущие пути
SELECT id, name, photo_id, photo_ids FROM products WHERE seller_id = 123456789;

-- Обновить путь (если нужно)
UPDATE products
SET photo_id = '/static/uploads/products/509fdc3df38d4f39a60ad9fcf475ef01.webp',
    photo_ids = '["/static/uploads/products/509fdc3df38d4f39a60ad9fcf475ef01.webp"]'
WHERE id = 1;
```

### Проблема: Фото не отображается в Telegram, но работает в браузере

**Причина:** config.json пустой или неправильный

**Проверка:**
```bash
curl https://app.flurai.ru/config.json
```

**Должно быть:**
```json
{"apiUrl":"https://api.flurai.ru"}
```

**Если пустой - пересобрать miniapp:**
```bash
docker compose -f docker-compose.prod.yml build miniapp
docker compose -f docker-compose.prod.yml up -d miniapp
```

### Проблема: Старые фото остались, новые не загружаются

**Причина:** Проблема с правами доступа к volume

**Решение:**
```bash
# Зайти в backend контейнер
docker compose -f docker-compose.prod.yml exec backend bash

# Проверить права
ls -la /src/backend/static/uploads/products/

# Исправить права (если нужно)
chmod 755 /src/backend/static/uploads/products/
```

## 📝 Миграция существующих файлов (если нужно)

Если у вас уже есть файлы в контейнере без volume:

```bash
# 1. Создать бэкап
docker compose exec backend tar -czf /tmp/static_backup.tar.gz -C /src/backend/static/uploads .

# 2. Скопировать на хост
docker cp flurai-backend-1:/tmp/static_backup.tar.gz /tmp/

# 3. Остановить и удалить контейнер
docker compose -f docker-compose.prod.yml stop backend
docker compose -f docker-compose.prod.yml rm -f backend

# 4. Запустить с volume (volume создастся автоматически)
docker compose -f docker-compose.prod.yml up -d backend

# 5. Восстановить файлы
docker cp /tmp/static_backup.tar.gz flurai-backend-1:/tmp/
docker compose -f docker-compose.prod.yml exec backend tar -xzf /tmp/static_backup.tar.gz -C /src/backend/static/uploads/

# 6. Проверить
docker compose -f docker-compose.prod.yml exec backend ls -la /src/backend/static/uploads/products/
```

## ✅ Статус исправлений

- ✅ **docker-compose.prod.yml** - добавлен volume static_uploads
- ✅ **nginx/nginx.prod.conf** - добавлено проксирование /static/ для api.flurai.ru
- ✅ **nginx/nginx.prod.conf** - исправлено проксирование /static/ для default server
- ✅ **miniapp/nginx.conf** - добавлено проксирование /static/ к backend
- ✅ **miniapp/Dockerfile** - генерация config.json с API URL при сборке
- ✅ **nginx/nginx.conf** - переключен на nginx.prod.conf (production)
- ✅ **Production сервер** - backend пересоздан с volume, файлы восстановлены

## 🎯 Итог

Теперь система **надежна** и **устойчива к пересборкам**:

1. ✅ Загруженные фото **НЕ удаляются** при деплое
2. ✅ Изображения доступны через **api.flurai.ru** и **app.flurai.ru**
3. ✅ Работает в **Telegram Mini App** и в браузере
4. ✅ Nginx **кэширует** изображения на 30 дней
5. ✅ Backend **раздает** статику через FastAPI StaticFiles
6. ✅ Volume **сохраняет** файлы между пересборками

**Дата исправления:** 2026-02-15

**Автор:** Claude Sonnet 4.5 + Разработчик

---

*Если возникли вопросы или проблемы, проверьте раздел "Частые проблемы и решения" выше.*
