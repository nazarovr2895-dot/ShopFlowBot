#!/bin/bash
# Быстрый деплой: commit + push + обновление на сервере
# С автоматическим запуском тестов перед деплоем

set -e

echo "🚀 Начинаем деплой..."

HAS_CHANGES=false
NEEDS_PUSH=false

# Проверяем состояние рабочего дерева
if [ -n "$(git status --porcelain)" ]; then
    HAS_CHANGES=true
fi

# Проверяем, есть ли локальные коммиты не запушенные в remote
git fetch origin main --quiet 2>/dev/null || true
LOCAL_AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo "0")
if [ "$LOCAL_AHEAD" -gt 0 ]; then
    NEEDS_PUSH=true
fi

if [ "$HAS_CHANGES" = false ] && [ "$NEEDS_PUSH" = false ]; then
    echo "❌ Нет изменений для деплоя (рабочее дерево чистое, все коммиты запушены)"
    exit 1
fi

# Показываем изменения
if [ "$HAS_CHANGES" = true ]; then
    echo "📝 Изменения:"
    git status --short
fi
if [ "$NEEDS_PUSH" = true ] && [ "$HAS_CHANGES" = false ]; then
    echo "📝 Незапушенные коммиты: $LOCAL_AHEAD"
    git log --oneline origin/main..HEAD
fi

# Запускаем тесты только при наличии незакоммиченных backend-изменений
if [ "$HAS_CHANGES" = true ]; then
    BACKEND_CHANGES=$(git status --porcelain | grep -E 'backend/' || true)

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
                 backend/tests/test_payments.py \
                 backend/tests/test_categories.py \
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
fi

# Коммит (только если есть незакоммиченные изменения)
if [ "$HAS_CHANGES" = true ]; then
    if [ -z "$1" ]; then
        echo "Введите сообщение коммита:"
        read COMMIT_MSG
    else
        COMMIT_MSG="$1"
    fi

    echo "💾 Коммитим..."
    git add -A -- . ':!.claude/plans'
    git commit -m "$COMMIT_MSG"
fi

# Push (с автоматическим pull --rebase при необходимости)
echo "📤 Пушим..."
if ! git push 2>/dev/null; then
    echo "⚠️  Push отклонён, подтягиваем remote изменения..."
    git pull --rebase origin main
    git push
fi

echo "✅ Код отправлен в GitHub"

# Обновление на сервере (одна SSH-сессия: pull + build + up + миграции + health checks)
echo "🔄 Обновляем сервер..."
ssh yandex-cloud bash -s << 'REMOTE'
set -e
cd ~/flurai

# Pull + Build + Up
git pull
docker compose -f docker-compose.prod.yml build backend worker bot admin_bot admin seller miniapp
docker compose -f docker-compose.prod.yml up -d

# Перезагрузить nginx чтобы подхватить новые IP контейнеров
docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload 2>/dev/null || \
  docker compose -f docker-compose.prod.yml restart nginx
echo "🔄 Nginx перезагружен"

# Миграции
echo "📦 Применяем миграции БД..."
MIGRATE_OUT=$(docker compose -f docker-compose.prod.yml exec -T backend bash -c 'cd /src/backend && alembic upgrade head' 2>&1)
if echo "$MIGRATE_OUT" | grep -qE "Running upgrade"; then
    echo "✅ Миграции применены"
else
    echo "✅ Миграции актуальны"
fi

# Пауза для стабилизации
sleep 3

# Health checks
echo "🔍 Проверка сервисов..."

HEALTH=$(curl -sf http://backend:8000/health 2>/dev/null || curl -sf http://localhost:8000/health 2>/dev/null || echo "")
if echo "$HEALTH" | grep -q "healthy"; then
    echo "✅ Backend: OK"
else
    echo "⚠️  Backend: проверьте вручную"
fi

APP_CODE=$(curl -s -o /dev/null -w '%{http_code}' https://app.flurai.ru 2>/dev/null)
if [ "$APP_CODE" = "200" ]; then
    echo "✅ Mini App: OK"
else
    echo "⚠️  Mini App: status $APP_CODE"
fi

ADMIN_CODE=$(curl -s -o /dev/null -w '%{http_code}' https://admin.flurai.ru 2>/dev/null)
if [ "$ADMIN_CODE" = "200" ]; then
    echo "✅ Admin Panel: OK"
else
    echo "⚠️  Admin Panel: status $ADMIN_CODE"
fi

SELLER_CODE=$(curl -s -o /dev/null -w '%{http_code}' https://seller.flurai.ru 2>/dev/null)
if [ "$SELLER_CODE" = "200" ]; then
    echo "✅ Seller Panel: OK"
else
    echo "⚠️  Seller Panel: status $SELLER_CODE"
fi
REMOTE

echo ""
echo "✅ Деплой завершён!"
echo ""
echo "🌐 Проверьте сайты:"
echo "   https://app.flurai.ru"
echo "   https://admin.flurai.ru"
echo "   https://seller.flurai.ru"
