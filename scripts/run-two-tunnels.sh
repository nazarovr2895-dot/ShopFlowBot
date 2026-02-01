#!/usr/bin/env bash
# Два туннеля Loophole: 8000 (бэкенд) и 3000 (фронтенд).
# По умолчанию используется путь к loophole из Downloads; можно задать LOOPHOLE_CLI.

set -e
LOOPHOLE="${LOOPHOLE_CLI:-$HOME/Downloads/loophole-cli_1.0.0-beta.15_macos_arm64/loophole}"

if [[ ! -x "$LOOPHOLE" ]]; then
  echo "Loophole не найден: $LOOPHOLE"
  echo "Задайте путь: LOOPHOLE_CLI=/path/to/loophole $0"
  exit 1
fi

echo "Бэкенд (8000) и фронт (3000) — каждый туннель выведет свой URL."
echo "После запуска обнови .env и miniapp/.env (см. scripts/README.md — Два туннеля)."
echo ""

# Запуск в фоне с префиксом в выводе, чтобы было видно, какой URL к какому порту
( "$LOOPHOLE" http 8000 2>&1 | sed 's/^/[backend 8000] /' ) &
PID1=$!
( "$LOOPHOLE" http 3000 2>&1 | sed 's/^/[front 3000] /' ) &
PID2=$%

trap "kill $PID1 $PID2 2>/dev/null; exit 0" INT TERM
wait
