# Команды для работы с сервером

## Подключение к серверу

```bash
# Подключиться по SSH
ssh yandex-cloud
# или
ssh ubuntu@51.250.112.85 -i ~/.ssh/yandex_cloud
```

---

## Управление Docker Compose

### Просмотр статуса контейнеров
```bash
cd ~/shopflowbot
docker compose -f docker-compose.prod.yml ps
# Показывает все контейнеры и их статус (Up, Restarting, Exited)
```

### Просмотр логов
```bash
# Логи всех сервисов
docker compose -f docker-compose.prod.yml logs

# Логи конкретного сервиса (последние 50 строк)
docker compose -f docker-compose.prod.yml logs --tail 50 backend
docker compose -f docker-compose.prod.yml logs --tail 50 bot
docker compose -f docker-compose.prod.yml logs --tail 50 admin
docker compose -f docker-compose.prod.yml logs --tail 50 miniapp
docker compose -f docker-compose.prod.yml logs --tail 50 nginx

# Следить за логами в реальном времени (Ctrl+C для выхода)
docker compose -f docker-compose.prod.yml logs -f backend
```

### Перезапуск сервисов
```bash
# Перезапустить один сервис
docker compose -f docker-compose.prod.yml restart backend
docker compose -f docker-compose.prod.yml restart bot

# Перезапустить все сервисы
docker compose -f docker-compose.prod.yml restart

# Остановить все сервисы
docker compose -f docker-compose.prod.yml down

# Запустить все сервисы
docker compose -f docker-compose.prod.yml up -d
```

### Пересборка и обновление
```bash
# Пересобрать образ (после изменений в коде)
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml build bot
docker compose -f docker-compose.prod.yml build admin
docker compose -f docker-compose.prod.yml build miniapp

# Пересобрать и перезапустить
docker compose -f docker-compose.prod.yml up -d --build backend

# Пересобрать без кэша (если что-то не работает)
docker compose -f docker-compose.prod.yml build --no-cache backend
```

---

## Работа с базой данных

### Выполнить миграции
```bash
docker compose -f docker-compose.prod.yml exec backend bash -c "cd /src/backend && alembic upgrade head"
```

### Подключиться к PostgreSQL
```bash
# Войти в контейнер БД
docker compose -f docker-compose.prod.yml exec db psql -U postgres -d shopflowbot

# Выполнить SQL запрос напрямую
docker compose -f docker-compose.prod.yml exec db psql -U postgres -d shopflowbot -c "SELECT COUNT(*) FROM users;"
```

### Бэкап базы данных
```bash
# Создать бэкап
docker compose -f docker-compose.prod.yml exec db pg_dump -U postgres shopflowbot > backup_$(date +%Y%m%d_%H%M%S).sql

# Восстановить из бэкапа
cat backup_20260209_120000.sql | docker compose -f docker-compose.prod.yml exec -T db psql -U postgres shopflowbot
```

---

## Проверка работы

### Health check
```bash
# Проверить здоровье backend
curl -s http://localhost/health | jq
# или без jq
curl -s http://localhost/health

# Проверить метрики
curl -s http://localhost/metrics
```

### Проверка сетевых подключений
```bash
# Проверить, видит ли backend базу данных
docker compose -f docker-compose.prod.yml exec backend getent hosts db

# Проверить, видит ли backend redis
docker compose -f docker-compose.prod.yml exec backend getent hosts redis
```

---

## Обновление кода с GitHub

### Обновить код и перезапустить
```bash
cd ~/shopflowbot
git pull
docker compose -f docker-compose.prod.yml build backend bot admin miniapp
docker compose -f docker-compose.prod.yml up -d
```

### Обновить только backend
```bash
cd ~/shopflowbot
git pull
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d backend
```

---

## Мониторинг ресурсов

### Использование диска
```bash
# Размер Docker образов
docker images

# Размер volumes (БД, Redis)
docker volume ls
docker system df
```

### Использование памяти и CPU
```bash
# Статистика контейнеров
docker stats

# Остановить (Ctrl+C)
```

---

## Очистка

### Удалить неиспользуемые образы
```bash
docker image prune -a
```

### Очистить всё (осторожно!)
```bash
# Удалить остановленные контейнеры, неиспользуемые сети, образы
docker system prune -a
```

---

## Полезные команды

### Войти в контейнер (для отладки)
```bash
# Backend
docker compose -f docker-compose.prod.yml exec backend bash

# Bot
docker compose -f docker-compose.prod.yml exec bot bash

# Nginx
docker compose -f docker-compose.prod.yml exec nginx sh
```

### Проверить переменные окружения в контейнере
```bash
docker compose -f docker-compose.prod.yml exec backend env | grep DB_
```

### Просмотреть конфигурацию nginx
```bash
docker compose -f docker-compose.prod.yml exec nginx cat /etc/nginx/conf.d/default.conf
```
