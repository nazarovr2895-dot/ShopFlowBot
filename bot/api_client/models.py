"""
Shared data models for bot API client responses.
Replaces inline class definitions across sellers.py and orders.py.
"""


class DictObj:
    """Generic dict-to-object wrapper."""
    def __init__(self, d: dict):
        self.__dict__ = d


class SellerObj:
    def __init__(self, d: dict):
        self.seller_id = d.get("seller_id")
        self.shop_name = d.get("shop_name", "Shop")
        self.description = d.get("description")
        self.max_orders = d.get("max_orders", 0)
        self.daily_limit_date = d.get("daily_limit_date")
        self.limit_set_for_today = d.get("limit_set_for_today", False)
        self.orders_used_today = d.get("orders_used_today", 0)
        self.active_orders = d.get("active_orders", 0)
        self.pending_requests = d.get("pending_requests", 0)
        self.is_blocked = d.get("is_blocked", False)
        self.delivery_type = d.get("delivery_type")
        self.delivery_price = d.get("delivery_price", 0.0)
        self.map_url = d.get("map_url")
        self.placement_expired_at = d.get("placement_expired_at")
        self.deleted_at = d.get("deleted_at")
        self.is_deleted = d.get("is_deleted", False)


class OrderObj:
    def __init__(self, d: dict):
        self.id = d.get("id")
        self.buyer_id = d.get("buyer_id")
        self.seller_id = d.get("seller_id")
        self.items_info = d.get("items_info", "")
        self.total_price = d.get("total_price", 0)
        self.original_price = d.get("original_price")
        self.status = d.get("status", "pending")
        self.delivery_type = d.get("delivery_type")
        self.address = d.get("address")
        self.created_at = d.get("created_at")


def is_success(resp) -> bool:
    """Unified response success check."""
    return bool(resp and resp.get("status") == "ok")
