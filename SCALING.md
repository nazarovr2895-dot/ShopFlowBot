# Масштабирование и производительность

## Горизонтальное масштабирование

### Backend инстансы

Для масштабирования до 10,000 одновременных пользователей требуется:

1. **Минимум 5-10 инстансов backend**
   ```bash
   docker-compose -f docker-compose.prod.yml up --scale backend=5
   ```

2. **Load balancer (nginx)**
   - Распределяет нагрузку между инстансами
   - Конфигурация в `nginx/nginx.conf`

3. **Connection pool на инстанс**
   - `DB_POOL_SIZE=50` (базовый пул)
   - `DB_MAX_OVERFLOW=100` (максимум соединений)
   - Итого: 5 инстансов × 150 соединений = 750 соединений максимум

### База данных

1. **Read replicas**
   - Настроить PostgreSQL streaming replication
   - Использовать `DB_READ_REPLICA_URL` для read-only запросов
   - Минимум 3-5 read replicas для высокой нагрузки

2. **Connection pooling**
   - Использовать PgBouncer или аналогичный пулер
   - Снижает нагрузку на PostgreSQL

3. **Партиционирование**
   - Рассмотреть партиционирование таблицы `orders` по датам
   - Улучшает производительность запросов по истории

### Redis

1. **Redis Cluster**
   - Для высокой доступности и масштабирования
   - Минимум 3 master + 3 replica nodes

2. **Альтернатива: Managed Redis**
   - AWS ElastiCache
   - Google Cloud Memorystore
   - Azure Cache for Redis

## Вертикальное масштабирование

### Backend

- CPU: минимум 2 ядра на инстанс
- Memory: минимум 2GB на инстанс
- Для 10K пользователей: 5-10 инстансов × 2GB = 10-20GB RAM

### База данных

- CPU: 4-8 ядер
- Memory: 8-16GB
- Storage: SSD с достаточным IOPS

### Redis

- Memory: 2-4GB (зависит от размера кэша)
- CPU: 2-4 ядра

## Оптимизация производительности

### Кэширование

1. **Агрессивное кэширование**
   - Списки товаров: TTL 5-10 минут
   - Справочники (города, районы): TTL 1 час
   - Популярные продавцы: TTL 15 минут

2. **Cache invalidation**
   - Инвалидация при обновлении данных
   - Использовать cache tags для групповой инвалидации

### Оптимизация запросов

1. **Индексы**
   - Добавлены составные индексы для частых запросов
   - Регулярно анализировать медленные запросы

2. **Query optimization**
   - Использовать `select_related` / `joinedload` для избежания N+1
   - Пагинация для больших списков
   - Ограничение количества возвращаемых записей

### CDN для статики

- Использовать CDN для изображений товаров
- Уменьшает нагрузку на backend
- Улучшает скорость загрузки для пользователей

## Мониторинг масштабирования

### Ключевые метрики

1. **Request rate**
   - Целевое значение: < 1000 req/s на инстанс
   - При превышении: добавить инстансы

2. **Response time**
   - p95 < 500ms
   - p99 < 1s
   - При превышении: оптимизировать запросы или добавить инстансы

3. **Database connections**
   - Использование пула < 80%
   - При превышении: увеличить пул или добавить read replicas

4. **CPU/Memory**
   - CPU < 70%
   - Memory < 80%
   - При превышении: масштабировать

### Автоматическое масштабирование

Для Kubernetes или Docker Swarm:

```yaml
# Kubernetes HPA example
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

## Оценка ресурсов для 10K пользователей

### Минимальная конфигурация

- Backend: 5 инстансов × 2GB = 10GB RAM
- Database: 8GB RAM, 4 CPU cores
- Redis: 2GB RAM
- Load balancer: 1GB RAM
- **Итого: ~21GB RAM, 20+ CPU cores**

### Рекомендуемая конфигурация

- Backend: 10 инстансов × 2GB = 20GB RAM
- Database: 16GB RAM, 8 CPU cores (с read replicas)
- Redis Cluster: 4GB RAM
- Load balancer: 2GB RAM
- **Итого: ~42GB RAM, 40+ CPU cores**

## Развертывание

### Docker Compose (для небольших нагрузок)

```bash
docker-compose -f docker-compose.prod.yml up -d --scale backend=5
```

### Kubernetes (рекомендуется для production)

Используйте Helm charts или Kubernetes manifests для:
- Deployment с replicas
- Service для load balancing
- HPA для автоматического масштабирования
- ConfigMap/Secrets для конфигурации

### Managed services

Для упрощения управления:
- Backend: AWS ECS, Google Cloud Run, Azure Container Instances
- Database: AWS RDS, Google Cloud SQL, Azure Database
- Redis: AWS ElastiCache, Google Cloud Memorystore, Azure Cache
