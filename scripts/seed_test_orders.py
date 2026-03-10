#!/usr/bin/env python3
"""
One-time script to seed test orders for a seller's analytics dashboard.

Creates ~65 completed orders spread over the last 30 days with 10 fake buyers.
Orders appear in analytics (status "done"/"completed").

Usage:
    python scripts/seed_test_orders.py          # seed orders
    python scripts/seed_test_orders.py --clean   # remove seeded orders and fake buyers
"""
import argparse
import asyncio
import random
import sys
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import delete, select

from backend.app.core.database import async_session
from backend.app.models.order import Order
from backend.app.models.seller import Seller
from backend.app.models.user import User

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
OWNER_TG_ID = 8073613186
NUM_ORDERS = 65
DAYS_BACK = 30
FAKE_BUYER_BASE_TG_ID = 7000000001

FAKE_BUYERS = [
    {"offset": 0, "fio": "Анна Петрова", "phone": "+79161234501", "username": "anna_p"},
    {"offset": 1, "fio": "Мария Иванова", "phone": "+79161234502", "username": "masha_i"},
    {"offset": 2, "fio": "Елена Сидорова", "phone": "+79161234503", "username": "lena_s"},
    {"offset": 3, "fio": "Ольга Козлова", "phone": "+79161234504", "username": None},
    {"offset": 4, "fio": "Наталья Смирнова", "phone": "+79161234505", "username": "natasha_sm"},
    {"offset": 5, "fio": "Дарья Волкова", "phone": "+79161234506", "username": None},
    {"offset": 6, "fio": "Екатерина Новикова", "phone": "+79161234507", "username": "katya_n"},
    {"offset": 7, "fio": "Ирина Морозова", "phone": "+79161234508", "username": "irina_m"},
    {"offset": 8, "fio": "Татьяна Лебедева", "phone": "+79161234509", "username": None},
    {"offset": 9, "fio": "Юлия Соколова", "phone": "+79161234510", "username": "yulya_s"},
]

PRODUCTS = [
    {"id": 900001, "name": "Букет из 25 красных роз", "price": 4500},
    {"id": 900002, "name": "Букет из 51 белой розы", "price": 8500},
    {"id": 900003, "name": "Микс из 15 тюльпанов", "price": 2100},
    {"id": 900004, "name": "Букет из 9 пионовидных роз", "price": 5200},
    {"id": 900005, "name": "Корзина из 101 розы", "price": 15000},
    {"id": 900006, "name": "Букет из 11 хризантем", "price": 1800},
    {"id": 900007, "name": "Букет невесты", "price": 6500},
    {"id": 900008, "name": "Монобукет из 25 тюльпанов", "price": 3500},
    {"id": 900009, "name": "Композиция в шляпной коробке", "price": 7200},
    {"id": 900010, "name": "Букет из 15 гортензий", "price": 4800},
    {"id": 900011, "name": "Букет из 9 оранжевых тюльпанов", "price": 1500},
    {"id": 900012, "name": "Авторский букет Весна", "price": 3900},
]

ADDRESSES = [
    "Москва, ул. Арбат, д. 10, кв. 5",
    "Москва, Тверская ул., д. 15",
    "Москва, пр-т Мира, д. 42, кв. 101",
    "Москва, ул. Покровка, д. 27",
    "Москва, Ленинский пр-т, д. 55, кв. 23",
    "Москва, Кутузовский пр-т, д. 30",
    "Москва, ул. Маросейка, д. 12, кв. 8",
    "Москва, ул. Большая Дмитровка, д. 7",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def generate_items_info() -> tuple[str, Decimal]:
    """Return (items_info string, total price)."""
    num_items = random.choices([1, 2, 3], weights=[50, 35, 15])[0]
    chosen = random.sample(PRODUCTS, min(num_items, len(PRODUCTS)))
    parts = []
    total = Decimal("0")
    for p in chosen:
        qty = random.randint(1, 3)
        price = Decimal(str(p["price"]))
        parts.append(f"{p['id']}:{p['name']}@{price:.2f} x {qty}")
        total += price * qty
    return ", ".join(parts), total


def generate_order_datetime(day_offset: int) -> datetime:
    """Generate a realistic order timestamp within business hours."""
    base = datetime.utcnow() - timedelta(days=day_offset)
    hour = random.randint(8, 21)
    minute = random.randint(0, 59)
    return base.replace(hour=hour, minute=minute, second=random.randint(0, 59))


def get_fake_buyer_ids() -> list[int]:
    return [FAKE_BUYER_BASE_TG_ID + b["offset"] for b in FAKE_BUYERS]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
async def seed_orders():
    async with async_session() as session:
        # 1. Find seller
        result = await session.execute(
            select(Seller).where(Seller.owner_id == OWNER_TG_ID)
        )
        seller = result.scalar_one_or_none()
        if not seller:
            print(f"Seller with owner_id={OWNER_TG_ID} not found!")
            sys.exit(1)
        seller_id = seller.seller_id
        print(f"Found seller: {seller.shop_name} (seller_id={seller_id})")

        # 2. Create fake buyers (skip existing)
        buyer_ids = []
        for b in FAKE_BUYERS:
            tg_id = FAKE_BUYER_BASE_TG_ID + b["offset"]
            existing = await session.execute(
                select(User.tg_id).where(User.tg_id == tg_id)
            )
            if existing.scalar_one_or_none() is None:
                session.add(User(
                    tg_id=tg_id,
                    fio=b["fio"],
                    phone=b["phone"],
                    username=b.get("username"),
                    role="BUYER",
                ))
            buyer_ids.append(tg_id)
        await session.flush()
        print(f"Ensured {len(buyer_ids)} fake buyers exist")

        # 3. Generate orders
        for i in range(NUM_ORDERS):
            day_offset = random.randint(0, DAYS_BACK - 1)

            # Weighted buyer selection — first 4 get more orders (returning customers)
            if random.random() < 0.6:
                buyer_id = random.choice(buyer_ids[:4])
            else:
                buyer_id = random.choice(buyer_ids)

            items_info, items_total = generate_items_info()

            is_delivery = random.random() < 0.6
            delivery_type = "Доставка" if is_delivery else "Самовывоз"
            delivery_fee = Decimal("350.00") if is_delivery else Decimal("0.00")
            total_price = items_total + delivery_fee

            order_time = generate_order_datetime(day_offset)
            completed_time = order_time + timedelta(
                hours=random.randint(1, 4), minutes=random.randint(0, 59)
            )

            status = random.choice(["done", "completed"])
            payment_method = "online" if random.random() < 0.8 else "on_pickup"
            payment_status = "succeeded" if payment_method == "online" else None
            address = random.choice(ADDRESSES) if is_delivery else None

            session.add(Order(
                seller_id=seller_id,
                buyer_id=buyer_id,
                items_info=items_info,
                total_price=total_price,
                original_price=total_price,
                status=status,
                delivery_type=delivery_type,
                address=address,
                delivery_fee=delivery_fee,
                payment_method=payment_method,
                payment_status=payment_status,
                created_at=order_time,
                completed_at=completed_time,
                is_preorder=False,
                points_used=Decimal("0"),
                points_discount=Decimal("0"),
            ))

        await session.commit()
        now = datetime.utcnow()
        print(f"Created {NUM_ORDERS} test orders for seller_id={seller_id}")
        print(f"Date range: {(now - timedelta(days=DAYS_BACK)).strftime('%Y-%m-%d')} — {now.strftime('%Y-%m-%d')}")
        print(f"Buyers: tg_id {buyer_ids[0]}–{buyer_ids[-1]}")


async def clean_orders():
    """Remove seeded test orders and fake buyers."""
    buyer_ids = get_fake_buyer_ids()
    async with async_session() as session:
        # Delete orders with fake buyer_ids
        result = await session.execute(
            delete(Order).where(Order.buyer_id.in_(buyer_ids))
        )
        orders_deleted = result.rowcount

        # Delete fake buyers
        result = await session.execute(
            delete(User).where(User.tg_id.in_(buyer_ids))
        )
        users_deleted = result.rowcount

        await session.commit()
        print(f"Deleted {orders_deleted} test orders and {users_deleted} fake buyers")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed test orders for seller analytics")
    parser.add_argument("--clean", action="store_true", help="Remove seeded data")
    args = parser.parse_args()

    if args.clean:
        asyncio.run(clean_orders())
    else:
        asyncio.run(seed_orders())
