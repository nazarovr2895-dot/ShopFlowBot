# Мониторинг и метрики

## Prometheus метрики

Приложение экспортирует метрики Prometheus на эндпоинте `/metrics`.

### HTTP метрики

- `http_requests_total` - Общее количество HTTP запросов (по методу, эндпоинту, статусу)
- `http_request_duration_seconds` - Длительность HTTP запросов (гистограмма)

### База данных

- `db_connections_active` - Количество активных соединений с БД
- `db_connections_idle` - Количество простаивающих соединений
- `db_query_duration_seconds` - Длительность запросов к БД

### Redis

- `redis_connections_active` - Количество активных соединений с Redis
- `redis_operations_total` - Общее количество операций Redis
- `redis_operation_duration_seconds` - Длительность операций Redis

### Бизнес-метрики

- `orders_created_total` - Количество созданных заказов (по продавцу, статусу)
- `orders_completed_total` - Количество завершенных заказов (по продавцу)
- `products_created_total` - Количество созданных товаров (по продавцу)
- `active_sellers` - Количество активных продавцов
- `active_products` - Количество активных товаров

## Настройка Prometheus

Добавьте в `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'flurai'
    static_configs:
      - targets: ['localhost:8000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

## Grafana дашборды

Рекомендуемые дашборды:

1. **HTTP метрики**
   - Request rate (запросов/сек)
   - Request latency (p50, p95, p99)
   - Error rate (4xx, 5xx)

2. **База данных**
   - Connection pool usage
   - Query duration
   - Active connections

3. **Бизнес-метрики**
   - Orders created per hour
   - Orders completed per hour
   - Active sellers/products

## Алерты

Рекомендуемые алерты:

```yaml
groups:
  - name: flurai_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.1
        for: 5m
        annotations:
          summary: "High error rate detected"
      
      - alert: HighLatency
        expr: histogram_quantile(0.95, http_request_duration_seconds) > 2
        for: 5m
        annotations:
          summary: "High request latency"
      
      - alert: DatabaseConnectionsExhausted
        expr: db_connections_active / db_connections_idle > 0.9
        for: 5m
        annotations:
          summary: "Database connection pool nearly exhausted"
```

## Health check

Эндпоинт `/health` проверяет:
- Подключение к базе данных
- Подключение к Redis

Используется для:
- Kubernetes liveness/readiness probes
- Load balancer health checks
- Мониторинг доступности сервиса

## Логирование

Приложение использует структурированное логирование (structlog):
- JSON формат в production
- Человекочитаемый формат в development

Рекомендуется настроить централизованный сбор логов:
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Loki + Grafana
- Cloud logging (AWS CloudWatch, Google Cloud Logging)
