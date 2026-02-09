FROM python:3.11

# 1. Устанавливаем curl для healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# 2. Создаем рабочую папку "корня" проекта
WORKDIR /src

# 3. Копируем файл зависимостей в корень
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. ВАЖНО: Копируем код не просто в кучу, а в папку "backend",
# чтобы импорты вида "from backend.app..." работали корректно
COPY . backend/

# 5. Указываем Python, где искать модули (текущая папка src)
ENV PYTHONPATH=/src

# 6. Запускаем сервер, обращаясь к нему через полный путь
# Use --reload only in development (set RELOAD=true in environment)
# In production, use multiple workers for better performance
ENV RELOAD=${RELOAD:-false}
ENV WORKERS=${WORKERS:-4}

# Production command: use workers, no reload
# Development: set RELOAD=true to enable auto-reload
CMD if [ "$RELOAD" = "true" ]; then \
        uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload; \
    else \
        uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --workers $WORKERS; \
    fi