# Инструкция по настройке HTTPS (SSL) для ShopFlowBot

## Предварительные требования

1. **DNS записи настроены** в reg.ru:
   - `flowshow.ru` → IP вашего сервера (опционально, но рекомендуется)
   - `www.flowshow.ru` → IP вашего сервера (опционально)
   - `api.flowshow.ru` → IP вашего сервера
   - `admin.flowshow.ru` → IP вашего сервера
   - `app.flowshow.ru` → IP вашего сервера

2. **Проверка DNS** (выполните на локальной машине):
   ```bash
   dig flowshow.ru +short
   dig api.flowshow.ru +short
   dig admin.flowshow.ru +short
   dig app.flowshow.ru +short
   ```
   Все должны возвращать IP вашего сервера.

---

## Шаг 1: Подготовка на сервере

### 1.1. Подключитесь к серверу
```bash
ssh yandex-cloud
cd ~/shopflowbot
```

### 1.2. Обновите код (если нужно)
```bash
git pull
```

### 1.3. Убедитесь, что nginx контейнер работает
```bash
docker compose -f docker-compose.prod.yml ps nginx
```

---

## Шаг 2: Установка certbot и получение сертификатов

### Вариант А: Автоматический (рекомендуется)

Скопируйте скрипт на сервер и запустите:

```bash
# На сервере
cd ~/shopflowbot

# Создайте директорию scripts, если её нет
mkdir -p scripts

# Скопируйте содержимое scripts/setup_ssl.sh на сервер
# (или используйте git pull, если файл уже в репозитории)

# Сделайте скрипт исполняемым
chmod +x scripts/setup_ssl.sh

# Установите email для уведомлений (опционально)
export SSL_EMAIL="your-email@example.com"

# Запустите скрипт
./scripts/setup_ssl.sh
```

Скрипт автоматически:
- Установит certbot
- Получит сертификаты для всех трёх доменов
- Скопирует сертификаты в `nginx/ssl/`
- Настроит автоматическое обновление

### Вариант Б: Вручную

#### 2.1. Установите certbot
```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
```

#### 2.2. Создайте директорию для сертификатов
```bash
mkdir -p ~/shopflowbot/nginx/ssl
```

#### 2.3. Получите сертификаты для каждого домена

**Важно:** Перед получением сертификатов нужно временно остановить nginx контейнер, чтобы certbot мог использовать порт 80.

```bash
# Остановите nginx
docker compose -f docker-compose.prod.yml stop nginx

# Получите сертификат для api.flowshow.ru
sudo certbot certonly --standalone \
    --preferred-challenges http \
    -d api.flowshow.ru \
    --email your-email@example.com \
    --agree-tos \
    --non-interactive

# Получите сертификат для admin.flowshow.ru
sudo certbot certonly --standalone \
    --preferred-challenges http \
    -d admin.flowshow.ru \
    --email your-email@example.com \
    --agree-tos \
    --non-interactive

# Получите сертификат для app.flowshow.ru
sudo certbot certonly --standalone \
    --preferred-challenges http \
    -d app.flowshow.ru \
    --email your-email@example.com \
    --agree-tos \
    --non-interactive

# Получите сертификат для flowshow.ru и www.flowshow.ru (вместе)
sudo certbot certonly --standalone \
    --preferred-challenges http \
    -d flowshow.ru \
    -d www.flowshow.ru \
    --email your-email@example.com \
    --agree-tos \
    --non-interactive

# Скопируйте сертификаты в нужную директорию
sudo mkdir -p ~/shopflowbot/nginx/ssl/api.flowshow.ru
sudo cp /etc/letsencrypt/live/api.flowshow.ru/fullchain.pem ~/shopflowbot/nginx/ssl/api.flowshow.ru/fullchain.pem
sudo cp /etc/letsencrypt/live/api.flowshow.ru/privkey.pem ~/shopflowbot/nginx/ssl/api.flowshow.ru/privkey.pem

sudo mkdir -p ~/shopflowbot/nginx/ssl/admin.flowshow.ru
sudo cp /etc/letsencrypt/live/admin.flowshow.ru/fullchain.pem ~/shopflowbot/nginx/ssl/admin.flowshow.ru/fullchain.pem
sudo cp /etc/letsencrypt/live/admin.flowshow.ru/privkey.pem ~/shopflowbot/nginx/ssl/admin.flowshow.ru/privkey.pem

sudo mkdir -p ~/shopflowbot/nginx/ssl/app.flowshow.ru
sudo cp /etc/letsencrypt/live/app.flowshow.ru/fullchain.pem ~/shopflowbot/nginx/ssl/app.flowshow.ru/fullchain.pem
sudo cp /etc/letsencrypt/live/app.flowshow.ru/privkey.pem ~/shopflowbot/nginx/ssl/app.flowshow.ru/privkey.pem

sudo mkdir -p ~/shopflowbot/nginx/ssl/flowshow.ru
sudo cp /etc/letsencrypt/live/flowshow.ru/fullchain.pem ~/shopflowbot/nginx/ssl/flowshow.ru/fullchain.pem
sudo cp /etc/letsencrypt/live/flowshow.ru/privkey.pem ~/shopflowbot/nginx/ssl/flowshow.ru/privkey.pem

# Измените владельца файлов
sudo chown -R $USER:$USER ~/shopflowbot/nginx/ssl

# Запустите nginx обратно
docker compose -f docker-compose.prod.yml up -d nginx
```

---

## Шаг 3: Проверка работы

### 3.1. Проверьте конфигурацию nginx
```bash
docker compose -f docker-compose.prod.yml exec nginx nginx -t
```

Должно быть: `nginx: configuration file /etc/nginx/nginx.conf test is successful`

### 3.2. Перезапустите nginx
```bash
docker compose -f docker-compose.prod.yml restart nginx
```

### 3.3. Проверьте доступность HTTPS
```bash
# На сервере
curl -I https://flowshow.ru
curl -I https://api.flowshow.ru/health
curl -I https://admin.flowshow.ru
curl -I https://app.flowshow.ru

# Или с вашего компьютера
curl -I https://flowshow.ru
curl -I https://api.flowshow.ru/health
```

Должен вернуться статус `200 OK` или `301 Moved Permanently` (редирект).

**Примечание:** `flowshow.ru` будет редиректить на `app.flowshow.ru` (Mini App).

### 3.4. Проверьте в браузере

Откройте в браузере:
- `https://flowshow.ru` (должен редиректить на `app.flowshow.ru`)
- `https://api.flowshow.ru/health`
- `https://admin.flowshow.ru`
- `https://app.flowshow.ru`

В адресной строке должен быть зелёный замочек 🔒.

---

## Шаг 4: Настройка автоматического обновления сертификатов

Let's Encrypt сертификаты действительны 90 дней. Нужно настроить автоматическое обновление.

### 4.1. Создайте скрипт обновления

Создайте файл `/usr/local/bin/renew_certs.sh`:

```bash
sudo nano /usr/local/bin/renew_certs.sh
```

Содержимое:
```bash
#!/bin/bash
cd ~/shopflowbot

# Обновляем сертификаты
sudo certbot renew --quiet

# Копируем обновлённые сертификаты
DOMAINS=("api.flowshow.ru" "admin.flowshow.ru" "app.flowshow.ru")
for DOMAIN in "${DOMAINS[@]}"; do
    if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
        sudo cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "nginx/ssl/$DOMAIN/fullchain.pem"
        sudo cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "nginx/ssl/$DOMAIN/privkey.pem"
        sudo chown -R "$USER:$USER" "nginx/ssl/$DOMAIN"
    fi
done

# Перезапускаем nginx контейнер
docker compose -f docker-compose.prod.yml restart nginx

echo "✅ Сертификаты обновлены и nginx перезапущен"
```

Сделайте исполняемым:
```bash
sudo chmod +x /usr/local/bin/renew_certs.sh
```

### 4.2. Настройте cron

```bash
# Добавьте задачу в crontab
(crontab -l 2>/dev/null; echo "0 3 * * * /usr/local/bin/renew_certs.sh >> /var/log/certbot-renew.log 2>&1") | crontab -

# Проверьте
crontab -l
```

Это будет обновлять сертификаты каждый день в 3:00 утра.

### 4.3. Тестовый запуск обновления

```bash
sudo /usr/local/bin/renew_certs.sh
```

---

## Устранение проблем

### Ошибка: "Failed to connect to api.flowshow.ru"

**Причина:** DNS записи не настроены или не распространились.

**Решение:**
1. Проверьте DNS записи в reg.ru
2. Подождите 5-10 минут для распространения DNS
3. Проверьте: `dig api.flowshow.ru +short`

### Ошибка: "Port 80 is already in use"

**Причина:** Nginx контейнер использует порт 80.

**Решение:**
```bash
docker compose -f docker-compose.prod.yml stop nginx
# Получите сертификаты
docker compose -f docker-compose.prod.yml start nginx
```

### Ошибка: "nginx: [emerg] SSL_CTX_use_certificate"

**Причина:** Сертификаты не найдены или неправильный путь.

**Решение:**
1. Проверьте, что файлы существуют:
   ```bash
   ls -la ~/shopflowbot/nginx/ssl/api.flowshow.ru/
   ```
2. Убедитесь, что пути в `nginx.conf` правильные
3. Проверьте права доступа: `chmod 644 nginx/ssl/*/fullchain.pem`

### Сертификаты не обновляются автоматически

**Решение:**
1. Проверьте cron: `crontab -l`
2. Проверьте логи: `tail -f /var/log/certbot-renew.log`
3. Запустите вручную: `sudo /usr/local/bin/renew_certs.sh`

---

## Полезные команды

```bash
# Проверить статус сертификатов
sudo certbot certificates

# Обновить сертификаты вручную
sudo certbot renew

# Проверить конфигурацию nginx
docker compose -f docker-compose.prod.yml exec nginx nginx -t

# Посмотреть логи nginx
docker compose -f docker-compose.prod.yml logs nginx

# Проверить SSL сертификат
openssl s_client -connect api.flowshow.ru:443 -servername api.flowshow.ru
```

---

## Важно: поведение корневого домена

**`flowshow.ru`** настроен на редирект на **`app.flowshow.ru`** (Mini App). Это означает:
- `http://flowshow.ru` → `https://app.flowshow.ru`
- `https://flowshow.ru` → `https://app.flowshow.ru`

Если вы хотите изменить это поведение (например, редиректить на `admin.flowshow.ru` или проксировать на backend), отредактируйте `nginx/nginx.conf` и измените блок для `flowshow.ru`.

---

## Что дальше?

После настройки HTTPS:

1. ✅ Обновите `.env` на сервере:
   ```bash
   PUBLIC_API_URL=https://api.flowshow.ru
   ALLOWED_ORIGINS=https://admin.flowshow.ru,https://app.flowshow.ru
   ```

2. ✅ Перезапустите backend:
   ```bash
   docker compose -f docker-compose.prod.yml restart backend
   ```

3. ✅ Настройте Mini App URL в BotFather:
   - Web App URL: `https://app.flowshow.ru`

4. ✅ Протестируйте все три домена в браузере
