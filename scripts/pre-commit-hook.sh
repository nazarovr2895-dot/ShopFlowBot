#!/bin/bash
# Pre-commit hook для запуска тестов перед коммитом
# Установка: cp scripts/pre-commit-hook.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

set -e

echo "🧪 Running pre-commit tests..."
echo ""

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Проверяем, что мы в корне проекта
if [ ! -d "backend" ]; then
    echo -e "${RED}❌ Error: Must be run from project root${NC}"
    exit 1
fi

# Проверяем, есть ли изменения в backend
BACKEND_CHANGES=$(git diff --cached --name-only | grep -E '^backend/' || true)

if [ -z "$BACKEND_CHANGES" ]; then
    echo -e "${YELLOW}⏭️  No backend changes detected, skipping tests${NC}"
    exit 0
fi

echo -e "${YELLOW}📝 Backend changes detected:${NC}"
echo "$BACKEND_CHANGES"
echo ""

# Проверяем наличие виртуального окружения
if [ ! -d "backend/venv" ]; then
    echo -e "${YELLOW}⚠️  Virtual environment not found, creating...${NC}"
    cd backend
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt > /dev/null 2>&1
    cd ..
fi

# Активируем виртуальное окружение
echo -e "${YELLOW}🔧 Activating virtual environment...${NC}"
source backend/venv/bin/activate

# Запускаем только новые тесты (быстрее)
echo -e "${YELLOW}🧪 Running new tests (admin, buyers, seller_web, services)...${NC}"
echo ""

if pytest backend/tests/test_admin.py \
         backend/tests/test_buyers.py \
         backend/tests/test_seller_web.py \
         backend/tests/test_services.py \
         -q --tb=short; then
    echo ""
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo ""
else
    echo ""
    echo -e "${RED}❌ Tests failed! Fix them before committing.${NC}"
    echo ""
    echo -e "${YELLOW}💡 To run tests manually:${NC}"
    echo "   source backend/venv/bin/activate"
    echo "   pytest backend/tests/test_my_file.py -v"
    echo ""
    exit 1
fi

# Если есть изменения в Python файлах, проверяем их
PYTHON_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.py$' || true)

if [ -n "$PYTHON_FILES" ]; then
    echo -e "${YELLOW}🔍 Checking Python code style...${NC}"

    # Проверяем наличие flake8 (необязательно)
    if command -v flake8 &> /dev/null; then
        echo "$PYTHON_FILES" | xargs flake8 --max-line-length=120 --ignore=E501,W503 || {
            echo -e "${YELLOW}⚠️  Code style warnings found (non-blocking)${NC}"
        }
    fi
fi

echo -e "${GREEN}✨ Pre-commit checks passed! Ready to commit.${NC}"
exit 0
