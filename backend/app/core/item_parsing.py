"""
Centralized items_info string parsing.

items_info format:
  New:    "123:Розы@150.00 x 2, 456:Тюльпаны@200.00 x 3"
  Legacy: "123:Розы x 2, 456:Тюльпаны x 3"
"""
import re
from decimal import Decimal
from typing import List, Dict, Any, Optional

# Compiled patterns (reused across all calls)
ITEMS_WITH_PRICE_RE = re.compile(r'(\d+):(.+?)@(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)')
ITEMS_LEGACY_RE = re.compile(r'(\d+):(.+?)\s*[x×]\s*(\d+)')


def parse_items_info(items_info: Optional[str]) -> List[Dict[str, Any]]:
    """Parse items_info string into list of dicts.

    Returns list of dicts with keys:
      - product_id: int
      - name: str
      - quantity: int
      - price: Decimal (only for new format with embedded price)
    """
    text = items_info or ""

    # Try new format with embedded price first
    matches = ITEMS_WITH_PRICE_RE.findall(text)
    if matches:
        return [
            {
                "product_id": int(pid),
                "name": name.strip(),
                "quantity": int(qty),
                "price": Decimal(price),
            }
            for pid, name, price, qty in matches
        ]

    # Fallback: legacy format without price
    matches = ITEMS_LEGACY_RE.findall(text)
    return [
        {
            "product_id": int(pid),
            "name": name.strip(),
            "quantity": int(qty),
        }
        for pid, name, qty in matches
    ]


def build_items_info(items: List[Dict[str, Any]]) -> str:
    """Build items_info string from list of item dicts.

    Each dict should have: product_id, name, price (optional), quantity.
    """
    parts = []
    for item in items:
        pid = item["product_id"]
        name = item["name"]
        qty = item["quantity"]
        price = item.get("price")
        if price is not None:
            parts.append(f"{pid}:{name}@{price} x {qty}")
        else:
            parts.append(f"{pid}:{name} x {qty}")
    return ", ".join(parts)
