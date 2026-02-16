#!/bin/bash
# Быстрый деплой: commit + push + обновление на сервере
# С автоматическим запуском тестов перед деплоем

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

# Проверяем, есть ли изменения в backend
BACKEND_CHANGES=$(git status --porcelain | grep -E '^.M backend/' || true)

if [ -n "$BACKEND_CHANGES" ]; then
    echo ""
    echo "🧪 Обнаружены изменения в backend, запускаем тесты..."
    echo ""

    # Проверяем наличие виртуального окружения
    if [ ! -d "backend/venv" ]; then
        echo "⚠️  Виртуальное окружение не найдено, создаём..."
        cd backend
        python3 -m venv venv
        source venv/bin/activate
        pip install -r requirements.txt > /dev/null 2>&1
        cd ..
    fi

    # Активируем виртуальное окружение и запускаем тесты
    source backend/venv/bin/activate

    echo "Running tests..."
    if pytest backend/tests/test_admin.py \
             backend/tests/test_buyers.py \
             backend/tests/test_seller_web.py \
             backend/tests/test_services.py \
             -q --tb=short; then
        echo ""
        echo "✅ Все тесты прошли успешно!"
        echo ""
    else
        echo ""
        echo "❌ Тесты провалились! Деплой отменён."
        echo ""
        echo "💡 Исправьте ошибки и попробуйте снова."
        echo "   Запустить тесты вручную:"
        echo "   source backend/venv/bin/activate"
        echo "   pytest backend/tests/ -v"
        echo ""
        exit 1
    fi

    deactivate
else
    echo ""
    echo "⏭️  Изменений в backend нет, пропускаем тесты"
    echo ""
fi

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
