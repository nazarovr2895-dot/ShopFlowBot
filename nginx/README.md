# Nginx Configuration

## Файлы конфигурации

- **nginx.prod.conf** - Production конфигурация (HTTP 301 - постоянные редиректы)
- **nginx.dev.conf** - Development конфигурация (HTTP 302 - временные редиректы)
- **nginx.conf** - Активная конфигурация (симлинк на prod или dev)

## Различия между prod и dev

### Production (nginx.prod.conf)
```nginx
return 301 https://...;  # Permanent redirect
```
- Браузер кэширует редирект **навсегда**
- Быстрее (нет повторных проверок)
- Используется в production

### Development (nginx.dev.conf)
```nginx
return 302 https://...;  # Temporary redirect
```
- Браузер **НЕ** кэширует редирект
- При каждом запросе проверяет актуальность
- Безопасно для экспериментов

## Как переключить конфигурацию

### На локальной машине (development):

```bash
# Использовать dev конфигурацию
ln -sf nginx.dev.conf nginx.conf

# Перезапустить nginx
docker compose restart nginx
```

### На production сервере:

```bash
# Использовать prod конфигурацию
cd ~/flurai/nginx
ln -sf nginx.prod.conf nginx.conf

# Перезапустить nginx
docker compose -f docker-compose.prod.yml restart nginx
```

## Текущая конфигурация

Проверить какая конфигурация активна:

```bash
ls -la nginx/nginx.conf
# Покажет на какой файл ссылается
```

## Когда использовать какую конфигурацию

### Development (302):
- ✅ Локальная разработка
- ✅ Тестирование редиректов
- ✅ Эксперименты с доменами
- ✅ Staging/testing сервер

### Production (301):
- ✅ Production сервер
- ✅ Финальные, проверенные редиректы
- ✅ Когда уверены что конфигурация правильная

## Проблемы с кэшированием

Если браузер кэшировал старый 301 редирект:

### Для пользователей:

1. Открыть `chrome://net-internals/#hsts`
2. В разделе "Delete domain security policies"
3. Ввести домен (например: `app.flurai.ru`)
4. Нажать Delete
5. Перезапустить браузер

### Или hard refresh:

- **Mac**: `Cmd + Shift + R`
- **Windows**: `Ctrl + Shift + R`
- **Chrome DevTools**: ПКМ на кнопке обновления → "Empty Cache and Hard Reload"

## Docker Compose

### Development (docker-compose.yml)

```yaml
nginx:
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
```

Автоматически использует `nginx.conf` (который должен быть симлинком на `nginx.dev.conf`)

### Production (docker-compose.prod.yml)

```yaml
nginx:
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
```

Использует `nginx.conf` (который должен быть симлинком на `nginx.prod.conf`)

## Best Practices

1. **На локальной машине всегда используйте nginx.dev.conf**
   ```bash
   ln -sf nginx.dev.conf nginx.conf
   ```

2. **На production всегда используйте nginx.prod.conf**
   ```bash
   ln -sf nginx.prod.conf nginx.conf
   ```

3. **Перед деплоем в production - убедитесь что симлинк правильный**
   ```bash
   # На сервере
   cd ~/flurai/nginx
   ls -la nginx.conf  # Должен указывать на nginx.prod.conf
   ```

4. **При тестировании новых доменов/редиректов:**
   - Сначала тестируйте с 302 (dev конфигурация)
   - Когда уверены - переключайтесь на 301 (prod конфигурация)

## Автоматизация

Добавить в deploy.sh проверку:

```bash
# В deploy.sh на сервере
echo "Проверка nginx конфигурации..."
NGINX_LINK=$(readlink ~/flurai/nginx/nginx.conf)
if [ "$NGINX_LINK" != "nginx.prod.conf" ]; then
    echo "⚠️  WARNING: nginx.conf не указывает на nginx.prod.conf!"
    echo "Текущий симлинк: $NGINX_LINK"
    read -p "Переключить на production конфигурацию? (y/n) " -n 1 -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd ~/flurai/nginx
        ln -sf nginx.prod.conf nginx.conf
        echo "✅ Переключено на nginx.prod.conf"
    fi
fi
```

## Проверка конфигурации

```bash
# Проверить синтаксис nginx
docker compose exec nginx nginx -t

# Посмотреть активную конфигурацию
docker compose exec nginx cat /etc/nginx/conf.d/default.conf | grep "return"

# Должно быть:
# Development: return 302 https://...
# Production:  return 301 https://...
```

---

**Создано:** 2025-02-14
