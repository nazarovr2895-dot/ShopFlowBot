from bot.api_client.base import make_request
from typing import List

# --- ПРОДАВЕЦ ---

async def api_check_limit(seller_id: int) -> bool:
    # Запрашиваем инфо о продавце
    data = await make_request("GET", f"/sellers/{seller_id}")
    # Если продавец заблокирован, запрещаем действия
    if data and data.get("is_blocked"):
        return False
    return True 

async def api_get_seller(tg_id: int):
    data = await make_request("GET", f"/sellers/{tg_id}")
    if not data: return None
    
    class SellerObj:
        def __init__(self, d): 
            self.seller_id = d.get("seller_id")
            self.shop_name = d.get("shop_name", "Shop")
            self.description = d.get("description")
            self.max_orders = d.get("max_orders", 10)
            self.active_orders = d.get("active_orders", 0)
            self.pending_requests = d.get("pending_requests", 0)
            self.is_blocked = d.get("is_blocked", False)
            self.delivery_type = d.get("delivery_type")
            self.placement_expired_at = d.get("placement_expired_at")
            
    return SellerObj(data)

# --- ТОВАРЫ ---

async def api_create_product(seller_id: int, name: str, price: float, description: str, photo_id: str):
    payload = {
        "seller_id": seller_id,
        "name": name,
        "price": price,
        "description": description,
        "photo_id": photo_id
    }
    # Обратите внимание: путь должен совпадать с тем, что в backend/api/sellers.py
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

# --- АДМИНКА ---

async def api_get_cities():
    """Получить список городов"""
    return await make_request("GET", "/admin/cities")

async def api_get_districts(city_id: int):
    """Получить список округов по городу"""
    return await make_request("GET", f"/admin/districts/{city_id}")

async def api_create_seller(
    tg_id: int, fio: str, phone: str, shop_name: str,
    description: str = None, city_id: int = None, district_id: int = None,
    map_url: str = None, delivery_type: str = None, placement_expired_at: str = None
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
    return await make_request("POST", "/admin/create_seller", data=payload)

async def api_search_sellers(fio: str):
    """Поиск продавцов по ФИО"""
    return await make_request("GET", "/admin/sellers/search", params={"fio": fio})

async def api_update_seller_field(tg_id: int, field: str, value: str):
    """Обновить поле продавца"""
    payload = {"field": field, "value": value}
    resp = await make_request("PUT", f"/admin/sellers/{tg_id}/update", data=payload)
    return resp and resp.get("status") == "ok"

async def api_block_seller(tg_id: int, is_blocked: bool):
    """Заблокировать/разблокировать продавца"""
    resp = await make_request("PUT", f"/admin/sellers/{tg_id}/block", params={"is_blocked": str(is_blocked).lower()})
    return resp and resp.get("status") == "ok"

async def api_delete_seller(tg_id: int):
    """Удалить продавца"""
    resp = await make_request("DELETE", f"/admin/sellers/{tg_id}")
    return resp and resp.get("status") == "ok"

async def api_get_all_stats():
    """Получить общую статистику"""
    return await make_request("GET", "/admin/stats/all")

async def api_get_all_sellers():
    """Список всех продавцов"""
    return await make_request("GET", "/admin/sellers/all")

async def api_get_seller_stats(fio: str):
    """Получить статистику продавца"""
    return await make_request("GET", "/admin/stats/seller", params={"fio": fio})

async def api_get_agents_stats():
    """Получить статистику по агентам"""
    return await make_request("GET", "/admin/stats/agents")


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
                self.status = d.get("status", "pending")
                self.delivery_type = d.get("delivery_type")
                self.address = d.get("address")
                self.created_at = d.get("created_at")
        orders.append(OrderObj(item))
    return orders


async def api_update_order_status(order_id: int, status: str):
    """Изменить статус заказа"""
    return await make_request("PUT", f"/orders/{order_id}/status", params={"status": status})