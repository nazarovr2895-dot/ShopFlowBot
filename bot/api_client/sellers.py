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
            self.shop_name = d.get("shop_name", "Shop")
            self.max_orders = d.get("max_orders", 10)
            self.active_orders = 0
            self.pending_requests = 0
            self.is_blocked = d.get("is_blocked", False)
            self.address = "Адрес"
            
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

async def api_create_seller(tg_id: int, fio: str, phone: str, shop_name: str, delivery_type: str):
    """Реальное создание продавца через API"""
    payload = {
        "tg_id": tg_id,
        "shop_name": shop_name,
        "delivery_type": delivery_type
    }
    resp = await make_request("POST", "/admin/create_seller", data=payload)
    return resp and resp.get("status") == "ok"

async def api_update_seller_status(tg_id: int, is_blocked: bool):
    return True