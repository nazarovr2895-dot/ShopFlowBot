#!/bin/bash
# Скрипт для переключения между dev и prod конфигурациями Nginx

set -e

NGINX_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$NGINX_DIR"

# Функция вывода текущей конфигурации
show_current() {
    if [ -L nginx.conf ]; then
        CURRENT=$(readlink nginx.conf)
        echo "📋 Текущая конфигурация: $CURRENT"

        # Показать тип редиректов
        if grep -q "return 302" nginx.conf 2>/dev/null; then
            echo "   Тип: Development (302 - временные редиректы)"
        elif grep -q "return 301" nginx.conf 2>/dev/null; then
            echo "   Тип: Production (301 - постоянные редиректы)"
        fi
    else
        echo "⚠️  nginx.conf не является симлинком"
    fi
}

# Функция переключения на dev
switch_to_dev() {
    echo "🔧 Переключаем на Development конфигурацию..."
    ln -sf nginx.dev.conf nginx.conf
    echo "✅ Переключено на nginx.dev.conf (HTTP 302 - временные редиректы)"
    echo ""
    echo "⚠️  Перезапустите nginx:"
    echo "   docker compose restart nginx"
}

# Функция переключения на prod
switch_to_prod() {
    echo "🚀 Переключаем на Production конфигурацию..."
    ln -sf nginx.prod.conf nginx.conf
    echo "✅ Переключено на nginx.prod.conf (HTTP 301 - постоянные редиректы)"
    echo ""
    echo "⚠️  Перезапустите nginx:"
    echo "   docker compose -f docker-compose.prod.yml restart nginx"
}

# Главное меню
case "${1:-}" in
    dev|development)
        switch_to_dev
        ;;
    prod|production)
        switch_to_prod
        ;;
    status|current)
        show_current
        ;;
    *)
        echo "Nginx Configuration Switcher"
        echo ""
        show_current
        echo ""
        echo "Использование:"
        echo "  $0 dev          Переключить на development (302)"
        echo "  $0 prod         Переключить на production (301)"
        echo "  $0 status       Показать текущую конфигурацию"
        echo ""
        echo "Различия:"
        echo "  Development (302):  Браузер НЕ кэширует редиректы (для тестирования)"
        echo "  Production (301):   Браузер кэширует редиректы навсегда (для production)"
        ;;
esac
