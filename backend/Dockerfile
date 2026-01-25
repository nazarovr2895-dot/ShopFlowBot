FROM python:3.11

# 1. Создаем рабочую папку "корня" проекта
WORKDIR /src

# 2. Копируем файл зависимостей в корень
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. ВАЖНО: Копируем код не просто в кучу, а в папку "backend",
# чтобы импорты вида "from backend.app..." работали корректно
COPY . backend/

# 4. Указываем Python, где искать модули (текущая папка src)
ENV PYTHONPATH=/src

# 5. Запускаем сервер, обращаясь к нему через полный путь
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]