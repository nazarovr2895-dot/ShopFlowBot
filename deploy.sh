#!/bin/bash
# Быстрый деплой: commit + push + обновление на сервере

set -e

echo "🚀 Начинаем деплой..."

# Проверяем, что есть изменения для коммита
if [ -z "$(git status --porcelain)" ]; then
    echo "❌ Нет изменений для коммита"
    exit 1
fi

# Показываем изменения
echo "📝 Изменения:"
git status --short

# Коммит (если не передан как аргумент)
if [ -z "$1" ]; then
    echo "Введите сообщение коммита:"
    read COMMIT_MSG
else
    COMMIT_MSG="$1"
fi

# Commit + Push
echo "💾 Коммитим и пушим..."
git add .
git commit -m "$COMMIT_MSG"
git push

echo "✅ Код отправлен в GitHub"

# Обновление на сервере
echo "🔄 Обновляем сервер..."
ssh yandex-cloud "cd ~/shopflowbot && git pull && docker compose -f docker-compose.prod.yml build backend bot admin miniapp && docker compose -f docker-compose.prod.yml up -d && docker compose -f docker-compose.prod.yml up -d --build miniapp"

echo "✅ Деплой завершён!"
echo ""
echo "Проверьте логи:"
echo "  ssh yandex-cloud 'cd ~/shopflowbot && docker compose -f docker-compose.prod.yml logs --tail 20 backend'"
