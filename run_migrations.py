#!/usr/bin/env python3
"""
Скрипт для выполнения миграций базы данных.
Использование: python3 run_migrations.py
"""
import subprocess
import sys
from pathlib import Path

def run_migrations():
    """Выполняет миграции Alembic через Docker"""
    project_dir = Path(__file__).parent
    
    print("🔄 Выполняю миграции базы данных через Docker...")
    
    try:
        # Выполняем миграции через Docker Compose
        result = subprocess.run(
            ["docker-compose", "exec", "-w", "/src/backend", "backend", "alembic", "upgrade", "head"],
            cwd=project_dir,
            check=True,
            capture_output=True,
            text=True
        )
        
        print("✅ Миграции успешно выполнены!")
        if result.stdout:
            print(result.stdout)
        
    except subprocess.CalledProcessError as e:
        print(f"❌ Ошибка при выполнении миграций:")
        if e.stderr:
            print(e.stderr)
        if e.stdout:
            print(e.stdout)
        sys.exit(1)
    except FileNotFoundError:
        print("❌ Docker Compose не найден. Убедитесь, что Docker установлен и запущен.")
        print("\nАльтернативный способ:")
        print("   cd backend && alembic upgrade head")
        sys.exit(1)

if __name__ == "__main__":
    run_migrations()
