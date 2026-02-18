# Workflow разработки: локально → сервер

## Текущая архитектура

```
Локальная машина (разработка)
    ↓ git commit + push
GitHub
    ↓ git pull
Сервер (production)
    ↓ docker compose build + up
Docker контейнеры (backend, bot, admin, miniapp)
```

---

## Стандартный workflow разработки

### 1. Разработка локально

```bash
cd ~/flurai   # или путь к вашему клону репозитория

# Внести изменения в код
# Протестировать локально (если нужно)
# docker-compose up  # для локального тестирования

# Закоммитить изменения
git add .
git commit -m "описание изменений"
git push
```

### 2. Обновление на сервере

Полный список команд для сервера (Docker, БД, логи, бэкапы) — в [SERVER_COMMANDS.md](SERVER_COMMANDS.md).

**Вариант А: Вручную (рекомендуется для начала)**

```bash
# На сервере (подключение: ssh your-server или ssh user@your-server-ip)
ssh your-server
cd ~/flurai
git pull
docker compose -f docker-compose.prod.yml build backend  # или bot, admin, miniapp
docker compose -f docker-compose.prod.yml up -d backend
docker compose -f docker-compose.prod.yml logs -f backend  # проверить логи
```

**Вариант Б: Автоматизация через скрипт (см. ниже)**

---

## Автоматизация: скрипт для быстрого деплоя

### Скрипт деплоя (deploy.sh)

Создайте в корне проекта файл `deploy.sh`:

```bash
#!/bin/bash
# Быстрый деплой: commit + push + обновление на сервере

set -e

echo "🚀 Начинаем деплой..."

# 1. Проверяем, что есть изменения для коммита
if [ -z "$(git status --porcelain)" ]; then
    echo "❌ Нет изменений для коммита"
    exit 1
fi

# 2. Показываем изменения
echo "📝 Изменения:"
git status --short

# 3. Коммит (если не передан как аргумент)
if [ -z "$1" ]; then
    echo "Введите сообщение коммита:"
    read COMMIT_MSG
else
    COMMIT_MSG="$1"
fi

# 4. Commit + Push
echo "💾 Коммитим и пушим..."
git add .
git commit -m "$COMMIT_MSG"
git push

echo "✅ Код отправлен в GitHub"

# 5. Обновление на сервере (подставьте свой хост: алиас из ~/.ssh/config или user@host)
echo "🔄 Обновляем сервер..."
ssh your-server "cd ~/flurai && git pull && docker compose -f docker-compose.prod.yml build backend bot admin miniapp && docker compose -f docker-compose.prod.yml up -d"

echo "✅ Деплой завершён!"
```

**Использование:**

```bash
# Сделать исполняемым (один раз)
chmod +x deploy.sh

# Использовать
./deploy.sh "Добавил новую функцию X"
# или
./deploy.sh  # запросит сообщение коммита
```

---

## Автоматизация: GitHub Actions (CI/CD)

Создайте `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ubuntu
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd ~/flurai
            git pull
            docker compose -f docker-compose.prod.yml build backend bot admin miniapp
            docker compose -f docker-compose.prod.yml up -d
            docker compose -f docker-compose.prod.yml logs --tail 20 backend
```

**Настройка:**

1. В GitHub: Settings → Secrets and variables → Actions
2. Добавить секреты:
   - `SERVER_HOST` — IP или хост вашего сервера
   - `SSH_PRIVATE_KEY` — содержимое приватного SSH-ключа

После этого каждый `git push` в `main` автоматически обновит сервер.

---

## Рекомендуемый workflow

### Для небольших изменений (быстрый цикл)

```bash
# Локально
cd ~/flurai
# Внести изменения
git add .
git commit -m "fix: исправил баг X"
git push

# На сервере (вручную или через скрипт)
ssh your-server
cd ~/flurai
git pull
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d backend
docker compose -f docker-compose.prod.yml logs -f backend
```

### Для больших изменений (тестирование перед деплоем)

```bash
# 1. Создать ветку
git checkout -b feature/new-feature

# 2. Разработать и протестировать локально
# docker-compose up  # локальный тест

# 3. Закоммитить
git add .
git commit -m "feat: добавил новую функцию"
git push origin feature/new-feature

# 4. Создать Pull Request в GitHub (опционально, для ревью)

# 5. После проверки - смержить в main
git checkout main
git merge feature/new-feature
git push

# 6. Обновить сервер (см. выше)
```

---

## Проверка после деплоя

### Чеклист

```bash
# 1. Проверить статус контейнеров
docker compose -f docker-compose.prod.yml ps

# 2. Проверить health
curl -s http://localhost/health

# 3. Проверить логи (первые 30 строк)
docker compose -f docker-compose.prod.yml logs --tail 30 backend

# 4. Проверить, что нет ошибок
docker compose -f docker-compose.prod.yml logs backend | grep -i error
```

---

## Откат изменений (если что-то сломалось)

```bash
# На сервере
cd ~/flurai

# Посмотреть историю коммитов
git log --oneline -10

# Откатиться на предыдущий коммит
git reset --hard HEAD~1
# или на конкретный коммит
git reset --hard <commit-hash>

# Пересобрать и перезапустить
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d backend
```

---

## Разработка с hot reload (для быстрой итерации)

### Локально

```bash
# Backend с автоперезагрузкой
cd backend
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000

# Admin panel (в другом терминале)
cd adminpanel
npm run dev

# Mini app (в третьем терминале)
cd miniapp
npm run dev
```

### На сервере (production)

**НЕ используйте `--reload` в production!** Используйте только для локальной разработки.

---

## Частые сценарии

### Добавил новую миграцию БД

```bash
# Локально: создать миграцию
cd backend
alembic revision --autogenerate -m "описание"
git add backend/migrations/versions/...
git commit -m "migration: описание"
git push

# На сервере: применить миграцию (см. также SERVER_COMMANDS.md)
ssh your-server
cd ~/flurai
git pull
docker compose -f docker-compose.prod.yml exec backend bash -c "cd /src/backend && alembic upgrade head"
```

### Изменил переменные окружения

```bash
# На сервере: отредактировать .env
nano ~/flurai/.env

# Перезапустить сервисы (чтобы подхватили новые переменные)
docker compose -f docker-compose.prod.yml restart backend bot
```

### Изменил только frontend (admin/miniapp)

```bash
# Локально
git add adminpanel/ miniapp/
git commit -m "ui: обновил интерфейс"
git push

# На сервере
cd ~/flurai
git pull
docker compose -f docker-compose.prod.yml build admin miniapp
docker compose -f docker-compose.prod.yml up -d admin miniapp
```

---

## Безопасность

### ⚠️ Важно

1. **Никогда не коммитьте `.env`** — он в `.gitignore`
2. **Секреты только через переменные окружения** на сервере
3. **Регулярно делайте бэкапы БД** (см. команды выше)
4. **Проверяйте логи после деплоя** — убедитесь, что нет ошибок

---

## Полезные алиасы (опционально)

Добавьте в `~/.bashrc` или `~/.zshrc` (подставьте свой путь к проекту и хост сервера):

```bash
# Быстрый деплой
alias deploy='cd ~/flurai && git add . && git commit -m "$1" && git push && ssh your-server "cd ~/flurai && git pull && docker compose -f docker-compose.prod.yml build backend bot && docker compose -f docker-compose.prod.yml up -d"'

# Подключение к серверу
alias server='ssh your-server'

# Логи backend
alias logs-backend='ssh your-server "cd ~/flurai && docker compose -f docker-compose.prod.yml logs -f backend"'
```

Использование: `deploy "описание изменений"`
