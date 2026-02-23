from bot.api_client.base import make_request
from typing import List, Tuple, Optional
from datetime import datetime

# --- ПРОДАВЕЦ ---

async def api_check_limit(seller_id: int) -> bool:
    """Проверка: может ли продавец принимать заказы. Использует единый endpoint can-accept."""
    data = await make_request("GET", f"/sellers/{seller_id}/can-accept")
    if not data:
        return False
    return data.get("can_accept", False)


async def api_validate_seller_availability(seller_id: int) -> Tuple[bool, Optional[str]]:
    """
    Проверяет доступность продавца для покупки через единый endpoint can-accept.

    Возвращает кортеж (is_available, error_message):
    - (True, None) - продавец доступен
    - (False, "reason") - продавец недоступен + причина
    """
    data = await make_request("GET", f"/sellers/{seller_id}/can-accept")
    if not data:
        return (False, "not_found")
    if data.get("can_accept", False):
        return (True, None)
    return (False, data.get("reason", "unknown"))

async def api_get_seller(tg_id: int):
    data = await make_request("GET", f"/sellers/{tg_id}")
    if not data: return None
    
    class SellerObj:
        def __init__(self, d):
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
            
    return SellerObj(data)

# --- ТОВАРЫ ---

async def api_get_bouquets(seller_id: int):
    """Список букетов продавца (для выбора при добавлении товара из букета)."""
    data = await make_request("GET", f"/sellers/{seller_id}/bouquets")
    return data if isinstance(data, list) else []


async def api_upload_photo_from_telegram(file_id: str) -> Optional[str]:
    """Загрузить фото из Telegram на бэкенд. Возвращает photo_id (путь) или None."""
    data = await make_request("POST", "/sellers/upload-photo-from-telegram", data={"file_id": file_id})
    return data.get("photo_id") if data else None


async def api_create_product(
    seller_id: int,
    name: str,
    price: float,
    description: str,
    quantity: int = 0,
    bouquet_id: Optional[int] = None,
    photo_id: Optional[str] = None,
    photo_ids: Optional[List[str]] = None,
):
    payload = {
        "seller_id": seller_id,
        "name": name,
        "price": price,
        "description": description or "",
        "quantity": quantity,
    }
    if photo_ids:
        payload["photo_ids"] = photo_ids
    elif photo_id:
        payload["photo_id"] = photo_id
    if bouquet_id is not None:
        payload["bouquet_id"] = bouquet_id
    return await make_request("POST", "/sellers/products/add", data=payload)

async def api_get_my_products(seller_id: int):
    data = await make_request("GET", f"/sellers/{seller_id}/products")
    
    # Если пришел не список или пустота
    if not data or not isinstance(data, list):
        return []
    
    # Превращаем JSON словари в объекты
    products = []
    for item in data:
        class ProductObj:
            def __init__(self, d): self.__dict__ = d
        products.append(ProductObj(item))
    return products

# Алиас для удобства (используется в buyer.py)
api_get_products = api_get_my_products

async def api_delete_product(product_id: int):
    return await make_request("DELETE", f"/sellers/products/{product_id}")


async def api_get_product(product_id: int):
    """Получить товар по ID"""
    data = await make_request("GET", f"/sellers/products/{product_id}")
    if not data:
        return None
    
    class ProductObj:
        def __init__(self, d): self.__dict__ = d
    return ProductObj(data)


async def api_update_product(
    product_id: int,
    name: str = None,
    description: str = None,
    price: float = None,
    photo_id: str = None,
    photo_ids: Optional[List[str]] = None,
):
    """Обновить товар"""
    payload = {}
    if name is not None:
        payload["name"] = name
    if description is not None:
        payload["description"] = description
    if price is not None:
        payload["price"] = price
    if photo_ids is not None:
        payload["photo_ids"] = photo_ids
    elif photo_id is not None:
        payload["photo_id"] = photo_id
    return await make_request("PUT", f"/sellers/products/{product_id}", data=payload)

# --- АДМИНКА ---

async def api_get_cities():
    """Получить список городов"""
    return await make_request("GET", "/admin/cities")

async def api_get_districts(city_id: int):
    """Получить список округов по городу"""
    return await make_request("GET", f"/admin/districts/{city_id}")


async def api_search_metro(query: str):
    """
    Поиск станций метро по названию по всем районам.
    Возвращает список станций: [{"id", "name", "district_id", "line_color"}, ...].
    При пустом запросе или ошибке возвращает [].
    """
    q = (query or "").strip()
    if not q:
        return []
    data = await make_request("GET", "/public/metro/search", params={"q": q})
    if not isinstance(data, list):
        return []
    return data


async def api_create_seller(
    tg_id: int, fio: str, phone: str, shop_name: str,
    description: str = None, city_id: int = None, district_id: int = None,
    map_url: str = None, metro_id: int = None, metro_walk_minutes: int = None,
    delivery_type: str = None, placement_expired_at: str = None
):
    """Создание продавца с полными данными"""
    payload = {
        "tg_id": tg_id,
        "fio": fio,
        "phone": phone,
        "shop_name": shop_name,
        "description": description,
        "city_id": city_id,
        "district_id": district_id,
        "map_url": map_url,
        "delivery_type": delivery_type,
        "placement_expired_at": placement_expired_at
    }
    if metro_id is not None:
        payload["metro_id"] = metro_id
    if metro_walk_minutes is not None:
        payload["metro_walk_minutes"] = metro_walk_minutes
    return await make_request("POST", "/admin/create_seller", data=payload)

async def api_search_sellers(fio: str, include_deleted: bool = False):
    """Поиск продавцов по ФИО. По умолчанию не включает soft-deleted."""
    params = {"fio": fio}
    if include_deleted:
        params["include_deleted"] = "true"
    return await make_request("GET", "/admin/sellers/search", params=params)

async def api_update_seller_field(tg_id: int, field: str, value: str):
    """Обновить поле продавца"""
    payload = {"field": field, "value": value}
    resp = await make_request("PUT", f"/admin/sellers/{tg_id}/update", data=payload)
    return resp and resp.get("status") == "ok"

async def api_block_seller(tg_id: int, is_blocked: bool):
    """Заблокировать/разблокировать продавца"""
    resp = await make_request("PUT", f"/admin/sellers/{tg_id}/block", params={"is_blocked": str(is_blocked).lower()})
    return resp and resp.get("status") == "ok"

async def api_soft_delete_seller(tg_id: int):
    """Soft Delete продавца (скрыть, сохраняя данные и историю заказов)"""
    resp = await make_request("PUT", f"/admin/sellers/{tg_id}/soft-delete")
    return resp and resp.get("status") == "ok"


async def api_restore_seller(tg_id: int):
    """Восстановить soft-deleted продавца"""
    resp = await make_request("PUT", f"/admin/sellers/{tg_id}/restore")
    return resp and resp.get("status") == "ok"


async def api_delete_seller(tg_id: int):
    """Удалить продавца (Hard Delete - полное удаление из БД)"""
    resp = await make_request("DELETE", f"/admin/sellers/{tg_id}")
    return resp and resp.get("status") == "ok"

async def api_get_all_stats():
    """Получить общую статистику"""
    return await make_request("GET", "/admin/stats/all")

async def api_get_all_sellers(include_deleted: bool = False):
    """Список всех продавцов. По умолчанию не включает soft-deleted."""
    params = {}
    if include_deleted:
        params["include_deleted"] = "true"
    return await make_request("GET", "/admin/sellers/all", params=params if params else None)

async def api_get_seller_stats(fio: str):
    """Получить статистику продавца"""
    return await make_request("GET", "/admin/stats/seller", params={"fio": fio})

# --- ЗАКАЗЫ ПРОДАВЦА ---

async def api_get_seller_orders(seller_id: int, status: str = None):
    """Получить заказы продавца с фильтром по статусу"""
    params = {}
    if status:
        params["status"] = status
    data = await make_request("GET", f"/orders/seller/{seller_id}", params=params if params else None)
    
    if not data or not isinstance(data, list):
        return []
    
    # Превращаем в объекты
    orders = []
    for item in data:
        class OrderObj:
            def __init__(self, d): 
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
        orders.append(OrderObj(item))
    return orders


async def api_accept_order(order_id: int):
    """Принять заказ"""
    return await make_request("POST", f"/orders/{order_id}/accept")


async def api_reject_order(order_id: int):
    """Отклонить заказ"""
    return await make_request("POST", f"/orders/{order_id}/reject")


async def api_done_order(order_id: int):
    """Завершить заказ"""
    return await make_request("POST", f"/orders/{order_id}/done")


async def api_update_seller_limit(seller_id: int, max_orders: int):
    """Обновить лимит заказов продавца"""
    return await make_request("PUT", f"/sellers/{seller_id}/limits", params={"max_orders": max_orders})


async def api_get_seller_revenue_stats(seller_id: int):
    """Получить статистику заказов продавца (выручка, комиссия)"""
    return await make_request("GET", f"/orders/seller/{seller_id}/stats")


async def api_get_buyer_orders(buyer_id: int):
    """Получить заказы покупателя"""
    data = await make_request("GET", f"/orders/buyer/{buyer_id}")
    
    if not data or not isinstance(data, list):
        return []
    
    orders = []
    for item in data:
        class OrderObj:
            def __init__(self, d): 
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
        orders.append(OrderObj(item))
    return orders


async def api_update_order_status(order_id: int, status: str):
    """Изменить статус заказа"""
    return await make_request("PUT", f"/orders/{order_id}/status", params={"status": status})


async def api_update_order_price(order_id: int, new_price: float):
    """Изменить цену заказа"""
    return await make_request("PUT", f"/orders/{order_id}/price", params={"new_price": new_price})

