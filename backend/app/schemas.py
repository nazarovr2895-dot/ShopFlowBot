from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal

# --- Покупатели ---
class BuyerCreate(BaseModel):
    tg_id: int
    username: Optional[str] = None
    fio: Optional[str] = None
    # 👇 Добавили: при регистрации можно сразу указать, от кого пришел юзер
    referrer_id: Optional[int] = None 

class BuyerResponse(BuyerCreate):
    # id в твоей базе это и есть tg_id, но оставим поле для совместимости
    role: str
    # 👇 Добавили: баланс и реферала
    balance: Decimal = Decimal(0)
    referrer_id: Optional[int] = None

# --- Продавцы ---
class SellerCreate(BaseModel):
    tg_id: int
    shop_name: str
    delivery_type: str

class SellerResponse(SellerCreate):
    id: int # Тут id может отличаться от tg_id, если автоинкремент, или совпадать
    active_orders: int
    max_orders: int

# --- Заказы ---
class OrderCreate(BaseModel):
    buyer_id: int
    seller_id: int
    items_info: str
    total_price: Decimal 
    delivery_type: str
    address: Optional[str] = None
    agent_id: Optional[int] = None

class OrderResponse(BaseModel):
    id: int
    status: str

# --- Товары ---
class ProductCreate(BaseModel):
    seller_id: int
    name: str
    description: str
    price: float
    photo_id: Optional[str] = None
    quantity: int = 0

class ProductUpdate(BaseModel):
    """Схема для обновления товара - все поля опциональны"""
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    photo_id: Optional[str] = None
    quantity: Optional[int] = None

class ProductResponse(ProductCreate):
    id: int