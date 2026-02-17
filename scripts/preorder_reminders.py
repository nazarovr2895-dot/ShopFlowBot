#!/usr/bin/env python3
"""
Send preorder reminders for tomorrow's deliveries.

Run daily via cron, e.g.:
    0 18 * * * cd /src && python -m scripts.preorder_reminders

Sends:
  - Buyer: "Your preorder #{N} for tomorrow is confirmed"
  - Seller: Summary of all preorders for tomorrow (count + total + items)
"""
import asyncio
import re
from datetime import date, timedelta
from collections import defaultdict

from sqlalchemy import select, and_

from backend.app.core.database import async_session
from backend.app.models.order import Order
from backend.app.services.telegram_notify import (
    notify_preorder_reminder_buyer,
    notify_preorder_summary_seller,
)


async def send_reminders():
    tomorrow = date.today() + timedelta(days=1)
    print(f"Sending preorder reminders for {tomorrow.isoformat()}")

    async with async_session() as session:
        result = await session.execute(
            select(Order).where(
                and_(
                    Order.is_preorder.is_(True),
                    Order.preorder_delivery_date == tomorrow,
                    Order.status.in_(["pending", "accepted", "assembling"]),
                )
            )
        )
        orders = list(result.scalars().all())

    if not orders:
        print("No preorders for tomorrow.")
        return

    print(f"Found {len(orders)} preorders for tomorrow.")

    # Send buyer reminders
    for order in orders:
        await notify_preorder_reminder_buyer(
            buyer_id=order.buyer_id,
            order_id=order.id,
            seller_id=order.seller_id,
            preorder_delivery_date=tomorrow.strftime("%d.%m.%Y"),
            items_info=order.items_info or "",
        )

    # Aggregate by seller and send seller summaries
    by_seller: dict[int, list] = defaultdict(list)
    for order in orders:
        by_seller[order.seller_id].append(order)

    items_pattern = re.compile(r'(\d+):(.+?)\s*[x×]\s*(\d+)')

    for seller_id, seller_orders in by_seller.items():
        total_amount = sum(float(o.total_price or 0) for o in seller_orders)

        # Aggregate items
        product_totals: dict[str, int] = defaultdict(int)
        for order in seller_orders:
            for _, pname, qty_str in items_pattern.findall(order.items_info or ""):
                product_totals[pname.strip()] += int(qty_str)

        items_lines = [f"  {name} x {qty}" for name, qty in sorted(product_totals.items(), key=lambda x: -x[1])]
        items_summary = "\n".join(items_lines)

        await notify_preorder_summary_seller(
            seller_id=seller_id,
            delivery_date=tomorrow.strftime("%d.%m.%Y"),
            orders_count=len(seller_orders),
            total_amount=total_amount,
            items_summary=items_summary,
        )

    print(f"Sent reminders to {len(orders)} buyers and {len(by_seller)} sellers.")


if __name__ == "__main__":
    asyncio.run(send_reminders())
