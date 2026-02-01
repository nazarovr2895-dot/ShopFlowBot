#!/usr/bin/env python3
"""
Скрипт для загрузки станций метро Москвы в базу данных.

Принимает CSV или JSON файл со списком станций:
  - name: название станции
  - district_id: ID района (1-12 для Москвы)
  - line_color: HEX цвет линии (например, "#FF0000")

Использование:
  python scripts/load_metro_stations.py data/metro_stations.json
  python scripts/load_metro_stations.py data/metro_stations.csv

Формат CSV: name,district_id,line_color (заголовок обязателен)
Формат JSON: [{"name": "...", "district_id": 1, "line_color": "#f91f22"}, ...]
"""
import argparse
import asyncio
import csv
import json
import sys
from pathlib import Path

# Добавляем корень проекта в PYTHONPATH
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import select, text

from backend.app.core.database import async_session
from backend.app.models.seller import Metro, District


def load_from_json(filepath: Path) -> list[dict]:
    """Загружает данные из JSON файла."""
    with open(filepath, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("JSON должен содержать массив объектов")
    return data


def load_from_csv(filepath: Path) -> list[dict]:
    """Загружает данные из CSV файла."""
    rows = []
    with open(filepath, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames or "name" not in reader.fieldnames:
            raise ValueError("CSV должен содержать заголовок с колонкой 'name'")
        for row in reader:
            if not row.get("name"):
                continue
            district_id = row.get("district_id", "").strip()
            if not district_id:
                raise ValueError(f"Строка '{row.get('name')}': district_id обязателен")
            rows.append({
                "name": row["name"].strip(),
                "district_id": int(district_id),
                "line_color": (row.get("line_color") or "").strip() or None,
            })
    return rows


def validate_station(record: dict, index: int) -> None:
    """Валидирует запись станции."""
    if "name" not in record or not str(record["name"]).strip():
        raise ValueError(f"Запись {index + 1}: поле 'name' обязательно")
    if "district_id" not in record:
        raise ValueError(f"Запись {index + 1} ({record.get('name')}): поле 'district_id' обязательно")
    try:
        district_id = int(record["district_id"])
    except (TypeError, ValueError):
        raise ValueError(
            f"Запись {index + 1} ({record.get('name')}): district_id должен быть числом"
        )
    if district_id < 1:
        raise ValueError(
            f"Запись {index + 1} ({record.get('name')}): district_id должен быть >= 1"
        )
    line_color = record.get("line_color")
    if line_color is not None and line_color != "":
        line_color = str(line_color).strip()
        if not (line_color.startswith("#") and len(line_color) in (4, 7)):
            raise ValueError(
                f"Запись {index + 1} ({record.get('name')}): "
                f"line_color должен быть HEX (например #FF0000), получено: {line_color}"
            )


async def load_metro_stations(filepath: Path, dry_run: bool = False, replace: bool = False) -> int:
    """Загружает станции метро в БД. Возвращает количество загруженных записей."""
    suffix = filepath.suffix.lower()
    if suffix == ".json":
        records = load_from_json(filepath)
    elif suffix == ".csv":
        records = load_from_csv(filepath)
    else:
        raise ValueError("Поддерживаются только файлы .json и .csv")

    if not records:
        print("Файл не содержит записей.")
        return 0

    for i, rec in enumerate(records):
        validate_station(rec, i)

    async with async_session() as session:
        # Проверяем существование районов
        result = await session.execute(select(District.id))
        existing_district_ids = {r[0] for r in result.fetchall()}
        missing = [
            r["district_id"] for r in records
            if r["district_id"] not in existing_district_ids
        ]
        if missing:
            unique_missing = sorted(set(missing))
            raise ValueError(
                f"Районы с ID {unique_missing} не найдены в БД. "
                "Сначала заполните справочник районов (cities, districts)."
            )

        if dry_run:
            print(f"[DRY RUN] Будет загружено {len(records)} станций:")
            for r in records[:5]:
                print(f"  - {r['name']} (район {r['district_id']}, цвет {r.get('line_color')})")
            if len(records) > 5:
                print(f"  ... и ещё {len(records) - 5}")
            return len(records)

        if replace:
            print("🗑 Очищаю таблицу metro_stations...")
            await session.execute(text("UPDATE sellers SET metro_id = NULL WHERE metro_id IS NOT NULL"))
            await session.execute(text("DELETE FROM metro_stations"))
            # Сброс sequence для корректной нумерации новых записей
            try:
                await session.execute(text(
                    "SELECT setval('metro_stations_id_seq', 1, false)"
                ))
            except Exception:
                try:
                    await session.execute(text(
                        "SELECT setval(pg_get_serial_sequence('metro_stations', 'id'), 1, false)"
                    ))
                except Exception:
                    pass
            await session.commit()
            print("   Готово.")

        count = 0
        batch_size = 50
        for i, rec in enumerate(records):
            metro = Metro(
                name=str(rec["name"]).strip(),
                district_id=int(rec["district_id"]),
                line_color=(str(rec.get("line_color") or "").strip() or None),
            )
            session.add(metro)
            count += 1
            if (i + 1) % batch_size == 0:
                await session.flush()

        await session.commit()
        print(f"✅ Загружено {count} станций метро.")
        return count


def main():
    parser = argparse.ArgumentParser(
        description="Загрузка станций метро Москвы в базу данных"
    )
    parser.add_argument(
        "file",
        type=Path,
        help="Путь к JSON или CSV файлу с данными станций",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Проверить файл без записи в БД",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Очистить таблицу перед загрузкой (сбросит metro_id у продавцов)",
    )
    args = parser.parse_args()

    if not args.file.exists():
        print(f"❌ Файл не найден: {args.file}")
        sys.exit(1)

    try:
        count = asyncio.run(load_metro_stations(
            args.file, dry_run=args.dry_run, replace=args.replace
        ))
        if count == 0 and not args.dry_run:
            sys.exit(1)
    except ValueError as e:
        print(f"❌ Ошибка валидации: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        raise


if __name__ == "__main__":
    main()
