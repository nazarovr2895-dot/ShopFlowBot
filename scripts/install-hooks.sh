#!/bin/bash
# Установка Git hooks для автоматизации тестирования

set -e

echo "🔧 Installing Git hooks..."
echo ""

# Проверяем, что мы в корне проекта
if [ ! -d ".git" ]; then
    echo "❌ Error: Must be run from project root (where .git directory is)"
    exit 1
fi

# Копируем pre-commit hook
echo "📝 Installing pre-commit hook..."
cp scripts/pre-commit-hook.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

echo "✅ Pre-commit hook installed!"
echo ""
echo "Теперь тесты будут запускаться автоматически перед каждым коммитом."
echo ""
echo "📚 Для получения дополнительной информации см.:"
echo "   - TEST_AUTOMATION.md — руководство по автоматизации"
echo "   - TDD_GUIDE.md — как писать тесты для новых функций"
echo ""
echo "💡 Чтобы пропустить hook для конкретного коммита:"
echo "   git commit --no-verify -m 'WIP: message'"
echo ""
