"""
Prometheus metrics for application monitoring.
"""
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from prometheus_client.openmetrics.exposition import generate_latest as generate_latest_openmetrics
from fastapi import Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
import time


# Request metrics
http_requests_total = Counter(
    'http_requests_total',
    'Total number of HTTP requests',
    ['method', 'endpoint', 'status_code']
)

http_request_duration_seconds = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration in seconds',
    ['method', 'endpoint'],
    buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 2.5, 5.0, 10.0]
)

# Database metrics
db_connections_active = Gauge(
    'db_connections_active',
    'Number of active database connections'
)

db_connections_idle = Gauge(
    'db_connections_idle',
    'Number of idle database connections'
)

db_query_duration_seconds = Histogram(
    'db_query_duration_seconds',
    'Database query duration in seconds',
    ['query_type'],
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0]
)

# Redis metrics
redis_connections_active = Gauge(
    'redis_connections_active',
    'Number of active Redis connections'
)

redis_operations_total = Counter(
    'redis_operations_total',
    'Total number of Redis operations',
    ['operation', 'status']
)

redis_operation_duration_seconds = Histogram(
    'redis_operation_duration_seconds',
    'Redis operation duration in seconds',
    ['operation'],
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0]
)

# Business metrics
orders_created_total = Counter(
    'orders_created_total',
    'Total number of orders created',
    ['seller_id', 'status']
)

orders_completed_total = Counter(
    'orders_completed_total',
    'Total number of orders completed',
    ['seller_id']
)

products_created_total = Counter(
    'products_created_total',
    'Total number of products created',
    ['seller_id']
)

active_sellers = Gauge(
    'active_sellers',
    'Number of active sellers'
)

active_products = Gauge(
    'active_products',
    'Number of active products'
)


class PrometheusMiddleware(BaseHTTPMiddleware):
    """Middleware to collect HTTP request metrics."""
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # Get endpoint path (remove query parameters)
        endpoint = request.url.path
        
        # Skip metrics endpoint itself
        if endpoint == "/metrics":
            return await call_next(request)
        
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as e:
            status_code = 500
            raise
        finally:
            duration = time.time() - start_time
            
            # Record metrics
            http_requests_total.labels(
                method=request.method,
                endpoint=endpoint,
                status_code=status_code
            ).inc()
            
            http_request_duration_seconds.labels(
                method=request.method,
                endpoint=endpoint
            ).observe(duration)
        
        return response


def get_metrics_response(openmetrics: bool = False) -> Response:
    """
    Get Prometheus metrics response.
    
    Args:
        openmetrics: If True, return OpenMetrics format, else Prometheus format
        
    Returns:
        Response with metrics data
    """
    if openmetrics:
        content = generate_latest_openmetrics()
        content_type = "application/openmetrics-text; version=1.0.0; charset=utf-8"
    else:
        content = generate_latest()
        content_type = CONTENT_TYPE_LATEST
    
    return Response(content=content, media_type=content_type)
