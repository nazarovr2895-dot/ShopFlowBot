#!/bin/bash
# Запуск/статус Flurai на сервере + установка systemd сервиса
# Использование:
#   ./startup.sh              — запустить все сервисы
#   ./startup.sh --status     — проверить статус
#   ./startup.sh --install    — установить systemd сервис для автозапуска

set -e

SERVER="yandex-cloud"
PROJECT_DIR="~/flurai"
COMPOSE="docker compose -f docker-compose.prod.yml"

# --- Статус ---
if [ "$1" = "--status" ]; then
    echo "🔍 Проверяю статус сервисов..."
    ssh $SERVER bash -s <<REMOTE
cd $PROJECT_DIR

echo ""
echo "📦 Контейнеры:"
$COMPOSE ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "🔍 Health checks:"

HEALTH=\$(curl -sf http://backend:8000/health 2>/dev/null || curl -sf http://localhost:8000/health 2>/dev/null || echo "")
if echo "\$HEALTH" | grep -q "healthy"; then
    echo "  ✅ Backend: OK"
else
    echo "  ⚠️  Backend: недоступен"
fi

APP_CODE=\$(curl -s -o /dev/null -w '%{http_code}' https://app.flurai.ru 2>/dev/null)
[ "\$APP_CODE" = "200" ] && echo "  ✅ Mini App: OK" || echo "  ⚠️  Mini App: status \$APP_CODE"

ADMIN_CODE=\$(curl -s -o /dev/null -w '%{http_code}' https://admin.flurai.ru 2>/dev/null)
[ "\$ADMIN_CODE" = "200" ] && echo "  ✅ Admin Panel: OK" || echo "  ⚠️  Admin Panel: status \$ADMIN_CODE"

SELLER_CODE=\$(curl -s -o /dev/null -w '%{http_code}' https://seller.flurai.ru 2>/dev/null)
[ "\$SELLER_CODE" = "200" ] && echo "  ✅ Seller Panel: OK" || echo "  ⚠️  Seller Panel: status \$SELLER_CODE"

echo ""
echo "🖥  systemd сервис:"
systemctl is-enabled flurai 2>/dev/null && echo "  Автозапуск: включён" || echo "  Автозапуск: не установлен"
systemctl is-active flurai 2>/dev/null && echo "  Статус: активен" || echo "  Статус: неактивен"
REMOTE
    exit 0
fi

# --- Установка systemd сервиса ---
if [ "$1" = "--install" ]; then
    echo "📦 Устанавливаю systemd сервис на сервер..."

    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    scp "$SCRIPT_DIR/flurai.service" $SERVER:/etc/systemd/system/flurai.service

    ssh $SERVER bash -s <<'REMOTE'
systemctl daemon-reload
systemctl enable flurai
echo "✅ Сервис flurai установлен и включён для автозапуска"
echo ""
echo "Команды управления:"
echo "  systemctl start flurai   — запустить"
echo "  systemctl stop flurai    — остановить"
echo "  systemctl status flurai  — статус"
REMOTE
    exit 0
fi

# --- Запуск ---
echo "🚀 Запускаю Flurai на сервере..."
ssh $SERVER bash -s <<REMOTE
set -e
cd $PROJECT_DIR

echo "📦 Поднимаю контейнеры..."
$COMPOSE up -d

echo "⏳ Ожидаю стабилизации (5 сек)..."
sleep 5

echo "📦 Применяю миграции БД..."
MIGRATE_OUT=\$($COMPOSE exec -T backend bash -c 'cd /src/backend && alembic upgrade head' 2>&1)
if echo "\$MIGRATE_OUT" | grep -qE "Running upgrade"; then
    echo "✅ Миграции применены"
else
    echo "✅ Миграции актуальны"
fi

# Перезагрузить nginx
$COMPOSE exec -T nginx nginx -s reload 2>/dev/null || $COMPOSE restart nginx
echo "🔄 Nginx перезагружен"

sleep 3

echo ""
echo "🔍 Проверка сервисов..."

HEALTH=\$(curl -sf http://backend:8000/health 2>/dev/null || curl -sf http://localhost:8000/health 2>/dev/null || echo "")
if echo "\$HEALTH" | grep -q "healthy"; then
    echo "  ✅ Backend: OK"
else
    echo "  ⚠️  Backend: проверьте вручную"
fi

APP_CODE=\$(curl -s -o /dev/null -w '%{http_code}' https://app.flurai.ru 2>/dev/null)
[ "\$APP_CODE" = "200" ] && echo "  ✅ Mini App: OK" || echo "  ⚠️  Mini App: status \$APP_CODE"

ADMIN_CODE=\$(curl -s -o /dev/null -w '%{http_code}' https://admin.flurai.ru 2>/dev/null)
[ "\$ADMIN_CODE" = "200" ] && echo "  ✅ Admin Panel: OK" || echo "  ⚠️  Admin Panel: status \$ADMIN_CODE"

SELLER_CODE=\$(curl -s -o /dev/null -w '%{http_code}' https://seller.flurai.ru 2>/dev/null)
[ "\$SELLER_CODE" = "200" ] && echo "  ✅ Seller Panel: OK" || echo "  ⚠️  Seller Panel: status \$SELLER_CODE"

echo ""
echo "📦 Все контейнеры:"
$COMPOSE ps --format "table {{.Name}}\t{{.Status}}"
REMOTE

echo ""
echo "✅ Flurai запущен!"
echo ""
echo "🌐 Сайты:"
echo "   https://app.flurai.ru"
echo "   https://admin.flurai.ru"
echo "   https://seller.flurai.ru"
