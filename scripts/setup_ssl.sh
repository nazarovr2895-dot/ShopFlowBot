#!/bin/bash
# Скрипт для установки certbot и получения SSL сертификатов
# Запускать на ВМ (не в Docker контейнере)

set -e

echo "🔒 Настройка SSL сертификатов для Flurai"
echo ""

# Проверка, что скрипт запущен на Ubuntu/Debian
if [ ! -f /etc/debian_version ]; then
    echo "❌ Этот скрипт предназначен для Ubuntu/Debian"
    exit 1
fi

# Проверка, что скрипт запущен не в Docker
if [ -f /.dockerenv ]; then
    echo "❌ Этот скрипт должен запускаться на хост-машине, а не в Docker контейнере"
    exit 1
fi

# Переход в директорию проекта
cd ~/flurai || {
    echo "❌ Директория ~/flurai не найдена"
    exit 1
}

# 1. Установка certbot
echo "📦 Установка certbot..."
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx

# 2. Создание директории для сертификатов
echo "📁 Создание директории для SSL сертификатов..."
mkdir -p nginx/ssl

# 3. Получение сертификатов для каждого домена
DOMAINS=("api.flurai.ru" "admin.flurai.ru" "app.flurai.ru" "flurai.ru")
EMAIL="${SSL_EMAIL:-your-email@example.com}"

echo ""
echo "📧 Email для уведомлений Let's Encrypt: $EMAIL"
echo "   (можно изменить через переменную SSL_EMAIL)"
echo ""

# Останавливаем nginx контейнер временно (один раз для всех доменов)
echo "⏸️  Временно останавливаем nginx..."
docker compose -f docker-compose.prod.yml stop nginx || true

for DOMAIN in "${DOMAINS[@]}"; do
    echo "🔐 Получение сертификата для $DOMAIN..."
    
    # Для flurai.ru добавляем www.flurai.ru в один сертификат
    if [ "$DOMAIN" = "flurai.ru" ]; then
        # Получаем сертификат для flurai.ru и www.flurai.ru вместе
        sudo certbot certonly \
            --standalone \
            --preferred-challenges http \
            -d "flurai.ru" \
            -d "www.flurai.ru" \
            --email "$EMAIL" \
            --agree-tos \
            --non-interactive \
            --keep-until-expiring || {
            echo "❌ Ошибка при получении сертификата для $DOMAIN"
            docker compose -f docker-compose.prod.yml start nginx || true
            exit 1
        }
        
        # Копируем сертификаты (используем flurai.ru как базовое имя)
        echo "   📋 Копирование сертификатов..."
        sudo mkdir -p "nginx/ssl/flurai.ru"
        sudo cp "/etc/letsencrypt/live/flurai.ru/fullchain.pem" "nginx/ssl/flurai.ru/fullchain.pem"
        sudo cp "/etc/letsencrypt/live/flurai.ru/privkey.pem" "nginx/ssl/flurai.ru/privkey.pem"
        sudo chown -R "$USER:$USER" "nginx/ssl/flurai.ru"
    else
        # Для остальных доменов - обычная процедура
        sudo certbot certonly \
            --standalone \
            --preferred-challenges http \
            -d "$DOMAIN" \
            --email "$EMAIL" \
            --agree-tos \
            --non-interactive \
            --keep-until-expiring || {
            echo "❌ Ошибка при получении сертификата для $DOMAIN"
            docker compose -f docker-compose.prod.yml start nginx || true
            exit 1
        }
        
        # Копируем сертификаты в нужную директорию
        echo "   📋 Копирование сертификатов..."
        sudo mkdir -p "nginx/ssl/$DOMAIN"
        sudo cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "nginx/ssl/$DOMAIN/fullchain.pem"
        sudo cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "nginx/ssl/$DOMAIN/privkey.pem"
        sudo chown -R "$USER:$USER" "nginx/ssl/$DOMAIN"
    fi
    
    echo "   ✅ Сертификат для $DOMAIN получен и скопирован"
    echo ""
done

# Запускаем nginx обратно
echo "▶️  Запускаем nginx..."
docker compose -f docker-compose.prod.yml start nginx || docker compose -f docker-compose.prod.yml up -d nginx

# 4. Настройка автоматического обновления сертификатов
echo ""
echo "🔄 Настройка автоматического обновления сертификатов..."

# Создаём скрипт для обновления сертификатов
cat > /tmp/renew_certs.sh << 'EOF'
#!/bin/bash
# Скрипт для обновления SSL сертификатов и перезапуска nginx

cd ~/flurai

# Обновляем сертификаты
sudo certbot renew --quiet

# Копируем обновлённые сертификаты
DOMAINS=("api.flurai.ru" "admin.flurai.ru" "app.flurai.ru" "flurai.ru")
for DOMAIN in "${DOMAINS[@]}"; do
    if [ "$DOMAIN" = "flurai.ru" ]; then
        # Для flurai.ru используем то же имя директории
        if [ -f "/etc/letsencrypt/live/flurai.ru/fullchain.pem" ]; then
            sudo cp "/etc/letsencrypt/live/flurai.ru/fullchain.pem" "nginx/ssl/flurai.ru/fullchain.pem"
            sudo cp "/etc/letsencrypt/live/flurai.ru/privkey.pem" "nginx/ssl/flurai.ru/privkey.pem"
            sudo chown -R "$USER:$USER" "nginx/ssl/flurai.ru"
        fi
    else
        if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
            sudo cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "nginx/ssl/$DOMAIN/fullchain.pem"
            sudo cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "nginx/ssl/$DOMAIN/privkey.pem"
            sudo chown -R "$USER:$USER" "nginx/ssl/$DOMAIN"
        fi
    fi
done

# Перезапускаем nginx контейнер
docker compose -f docker-compose.prod.yml restart nginx

echo "✅ Сертификаты обновлены и nginx перезапущен"
EOF

sudo mv /tmp/renew_certs.sh /usr/local/bin/renew_certs.sh
sudo chmod +x /usr/local/bin/renew_certs.sh

# Настраиваем cron для автоматического обновления (каждый день в 3:00)
(crontab -l 2>/dev/null | grep -v renew_certs.sh; echo "0 3 * * * /usr/local/bin/renew_certs.sh >> /var/log/certbot-renew.log 2>&1") | crontab -

echo "✅ Автоматическое обновление настроено (cron: каждый день в 3:00)"
echo ""

# 5. Проверка конфигурации nginx
echo "🔍 Проверка конфигурации nginx..."
docker compose -f docker-compose.prod.yml exec nginx nginx -t || {
    echo "⚠️  Предупреждение: nginx конфигурация может быть некорректна"
    echo "   Это нормально, если сертификаты ещё не созданы"
}

echo ""
echo "✅ Настройка SSL завершена!"
echo ""
echo "📋 Что дальше:"
echo "   1. Убедитесь, что DNS записи настроены и указывают на IP сервера"
echo "   2. Проверьте работу:"
echo "      curl -I https://api.flurai.ru/health"
echo "      curl -I https://admin.flurai.ru"
echo "      curl -I https://app.flurai.ru"
echo ""
echo "📝 Для ручного обновления сертификатов:"
echo "   sudo /usr/local/bin/renew_certs.sh"
