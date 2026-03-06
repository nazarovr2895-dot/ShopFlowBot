#!/usr/bin/env python3
"""
One-off script: создать категории тюльпанов для продавца «Цветы на 8 марта»
и распределить все товары по категориям на основе числа в названии.

Запуск:
  # Через Docker (рекомендуется):
  docker compose exec backend python /app/scripts/setup_categories_cvetyna8marta.py

  # Локально (нужны env vars):
  DB_USER=xxx DB_PASSWORD=xxx DB_NAME=xxx python backend/scripts/setup_categories_cvetyna8marta.py
"""

import asyncio
import os
import re
import sys
from urllib.parse import quote_plus

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

# --- Конфигурация ---

SHOP_NAME_PATTERN = "%Цветы на 8 марта%"

CATEGORIES = [
    ("9 тюлпанов",   1),
    ("15 тюлпанов",  2),
    ("25 тюлпанов",  3),
    ("49 тюлпанов",  4),
    ("101 тюлпанов", 5),
]

# Проверяем от большего к меньшему — чтобы \b9\b не сработало внутри "49"
PATTERNS = [
    (101, re.compile(r"\b101\b")),
    (49,  re.compile(r"\b49\b")),
    (25,  re.compile(r"\b25\b")),
    (15,  re.compile(r"\b15\b")),
    (9,   re.compile(r"\b9\b")),
]

# sort_order → category_id (заполним после создания)
SORT_TO_CAT_ID: dict[int, int] = {}
NUM_TO_SORT = {101: 5, 49: 4, 25: 3, 15: 2, 9: 1}


def build_db_url() -> str:
    try:
        user = os.environ["DB_USER"]
        password = quote_plus(os.environ["DB_PASSWORD"])
        name = os.environ["DB_NAME"]
        host = os.environ.get("DB_HOST", "localhost")
        port = os.environ.get("DB_PORT", "5432")
    except KeyError as e:
        print(f"[ERROR] Не задана переменная окружения: {e}")
        sys.exit(1)
    return f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{name}"


async def main() -> None:
    engine = create_async_engine(build_db_url(), echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as session:
        async with session.begin():

            # 1. Найти продавца
            row = (await session.execute(
                text("SELECT seller_id, shop_name FROM sellers WHERE shop_name ILIKE :pat LIMIT 1"),
                {"pat": SHOP_NAME_PATTERN},
            )).fetchone()

            if not row:
                print(f"[ERROR] Продавец с именем магазина '{SHOP_NAME_PATTERN}' не найден.")
                return

            seller_id: int = row.seller_id
            print(f"[OK] Найден продавец: '{row.shop_name}' (seller_id={seller_id})")

            # 2. Создать категории (если ещё не существуют)
            print("\n--- Создание категорий ---")
            for name, sort_order in CATEGORIES:
                existing = (await session.execute(
                    text("SELECT id FROM categories WHERE seller_id=:sid AND name=:name LIMIT 1"),
                    {"sid": seller_id, "name": name},
                )).fetchone()

                if existing:
                    cat_id = existing.id
                    print(f"  уже есть: '{name}' (id={cat_id})")
                else:
                    result = await session.execute(
                        text(
                            "INSERT INTO categories (seller_id, name, sort_order, is_active, is_addon) "
                            "VALUES (:sid, :name, :sort, true, false) RETURNING id"
                        ),
                        {"sid": seller_id, "name": name, "sort": sort_order},
                    )
                    cat_id = result.fetchone().id
                    print(f"  создана:  '{name}' (id={cat_id})")

                SORT_TO_CAT_ID[sort_order] = cat_id

            # 3. Получить все товары продавца
            products = (await session.execute(
                text("SELECT id, name, category_id FROM products WHERE seller_id=:sid ORDER BY id"),
                {"sid": seller_id},
            )).fetchall()

            print(f"\n--- Распределение товаров (всего {len(products)}) ---")

            matched: list[tuple[int, str, int, str]] = []   # (product_id, name, cat_id, cat_name)
            unmatched: list[tuple[int, str]] = []

            cat_id_to_name = {
                SORT_TO_CAT_ID[so]: name for name, so in CATEGORIES
            }

            for prod in products:
                found_num = None
                for num, pattern in PATTERNS:
                    if pattern.search(prod.name):
                        found_num = num
                        break

                if found_num is not None:
                    sort_order = NUM_TO_SORT[found_num]
                    cat_id = SORT_TO_CAT_ID[sort_order]
                    matched.append((prod.id, prod.name, cat_id, cat_id_to_name[cat_id]))
                else:
                    unmatched.append((prod.id, prod.name))

            # 4. Обновить category_id у совпавших товаров
            for prod_id, prod_name, cat_id, cat_name in matched:
                await session.execute(
                    text("UPDATE products SET category_id=:cid WHERE id=:pid"),
                    {"cid": cat_id, "pid": prod_id},
                )

            # 5. Отчёт
            print(f"\nПривязано товаров: {len(matched)}/{len(products)}")
            print(f"Без категории:     {len(unmatched)}")

            # Группировка по категориям
            from collections import defaultdict
            by_cat: dict[str, list[str]] = defaultdict(list)
            for _, name, _, cat_name in matched:
                by_cat[cat_name].append(name)

            print()
            for cat_name, _ in CATEGORIES:
                items = by_cat.get(cat_name, [])
                print(f"  [{cat_name}] — {len(items)} шт.")
                for item_name in items:
                    print(f"    • {item_name}")

            if unmatched:
                print(f"\n  [БЕЗ КАТЕГОРИИ] — {len(unmatched)} шт.")
                for pid, name in unmatched:
                    print(f"    • id={pid}: {name}")
            else:
                print("\nВсе товары успешно распределены по категориям.")

    await engine.dispose()
    print("\n[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
