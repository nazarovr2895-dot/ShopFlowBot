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
ssh yandex-cloud "cd ~/shopflowbot && git pull && docker compose -f docker-compose.prod.yml build backend bot admin miniapp && docker compose -f docker-compose.prod.yml up -d"

# Перезапуск nginx для обновления upstream connections
echo "🔧 Перезапускаем nginx..."
ssh yandex-cloud "docker compose -f ~/shopflowbot/docker-compose.prod.yml restart nginx"

# Небольшая пауза для стабилизации
sleep 2

# Проверка что всё работает
echo "🔍 Проверка сервисов..."
HEALTH_CHECK=$(ssh yandex-cloud "curl -s http://localhost/health" 2>&1)
if echo "$HEALTH_CHECK" | grep -q "healthy"; then
    echo "✅ Backend: OK"
else
    echo "⚠️  Backend: проверьте вручную"
fi

APP_CHECK=$(ssh yandex-cloud "curl -s -o /dev/null -w '%{http_code}' https://app.flowshow.ru" 2>&1)
if [ "$APP_CHECK" = "200" ]; then
    echo "✅ Mini App: OK"
else
    echo "⚠️  Mini App: проверьте вручную (status: $APP_CHECK)"
fi

ADMIN_CHECK=$(ssh yandex-cloud "curl -s -o /dev/null -w '%{http_code}' https://admin.flowshow.ru" 2>&1)
if [ "$ADMIN_CHECK" = "200" ]; then
    echo "✅ Admin Panel: OK"
else
    echo "⚠️  Admin Panel: проверьте вручную (status: $ADMIN_CHECK)"
fi

echo ""
echo "✅ Деплой завершён!"
echo ""
echo "🌐 Проверьте сайты:"
echo "   https://app.flowshow.ru"
echo "   https://admin.flowshow.ru"
echo ""
echo "📊 Логи:"
echo "  ssh yandex-cloud 'cd ~/shopflowbot && docker compose -f docker-compose.prod.yml logs --tail 20 backend'"
echo "  ssh yandex-cloud 'cd ~/shopflowbot && docker compose -f docker-compose.prod.yml logs --tail 20 nginx'"
