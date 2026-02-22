from pydantic import BaseModel, Field, model_validator, field_validator
from typing import Optional, List
from decimal import Decimal
from backend.app.core.password_validation import sanitize_user_input

# --- Покупатели ---
class BuyerCreate(BaseModel):
    tg_id: int
    username: Optional[str] = None
    fio: Optional[str] = None
    # 👇 Добавили: при регистрации можно сразу указать, от кого пришел юзер
    referrer_id: Optional[int] = None 

class BuyerResponse(BuyerCreate):
    # id в твоей базе это и есть tg_id, но оставим поле для совместимости
    id: Optional[int] = None
    role: str
    # 👇 Добавили: баланс и реферала
    balance: Decimal = Decimal(0)
    referrer_id: Optional[int] = None
    # 👇 Поля для локации
    city_id: Optional[int] = None
    district_id: Optional[int] = None
    # 👇 Телефон (для клубной карты / лояльности)
    phone: Optional[str] = None
    # 👇 Согласие на обработку ПД (152-ФЗ)
    privacy_accepted: bool = False
    privacy_accepted_at: Optional[str] = None

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
    is_preorder: bool = False
    preorder_delivery_date: Optional[str] = None  # YYYY-MM-DD
    
    @field_validator("items_info", "address")
    @classmethod
    def sanitize_text_fields(cls, v: Optional[str]) -> Optional[str]:
        """Sanitize user input to prevent XSS."""
        if v is None:
            return None
        return sanitize_user_input(v, max_length=5000)

class OrderResponse(BaseModel):
    id: int
    status: str


# --- Гостевой checkout (без Telegram-авторизации) ---
class GuestCartItem(BaseModel):
    product_id: int
    seller_id: int
    name: str
    price: Decimal
    quantity: int = Field(gt=0)

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_user_input(v, max_length=500)


class GuestCheckoutBody(BaseModel):
    guest_name: str
    guest_phone: str
    delivery_type: str  # "Доставка" | "Самовывоз"
    address: str
    comment: Optional[str] = None
    items: List[GuestCartItem] = Field(min_length=1)

    @field_validator("guest_name")
    @classmethod
    def sanitize_guest_name(cls, v: str) -> str:
        return sanitize_user_input(v, max_length=255)

    @field_validator("address")
    @classmethod
    def sanitize_address(cls, v: str) -> str:
        return sanitize_user_input(v, max_length=5000)

    @field_validator("comment")
    @classmethod
    def sanitize_comment(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_user_input(v, max_length=2000)


# --- Товары ---
MAX_PRODUCT_PHOTOS = 3

COMPOSITION_UNITS = ("шт.", "м", "г", "кг", "упак.", "мл", "л")


class CompositionItem(BaseModel):
    name: str
    qty: Optional[float] = None
    unit: Optional[str] = None

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_user_input(v, max_length=255)

    @field_validator("unit")
    @classmethod
    def validate_unit(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in COMPOSITION_UNITS:
            return None
        return v


class ProductCreate(BaseModel):
    seller_id: int
    name: str
    description: str
    price: float = Field(gt=0)
    photo_id: Optional[str] = None  # legacy: one photo
    photo_ids: Optional[List[str]] = None  # up to MAX_PRODUCT_PHOTOS
    quantity: int = Field(default=0, ge=0)
    bouquet_id: Optional[int] = None
    is_preorder: bool = False
    cost_price: Optional[float] = Field(default=None, ge=0)
    markup_percent: Optional[float] = Field(default=None, ge=0)
    composition: Optional[List[CompositionItem]] = None

    @field_validator("name", "description")
    @classmethod
    def sanitize_text_fields(cls, v: str) -> str:
        """Sanitize user input to prevent XSS."""
        return sanitize_user_input(v, max_length=2000)

    @model_validator(mode="after")
    def truncate_photo_ids(self):
        if self.photo_ids is not None:
            self.photo_ids = [str(p).strip() for p in self.photo_ids if p][:MAX_PRODUCT_PHOTOS]
        return self


class ProductUpdate(BaseModel):
    """Схема для обновления товара - все поля опциональны"""
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = Field(default=None, gt=0)
    photo_id: Optional[str] = None
    photo_ids: Optional[List[str]] = None
    quantity: Optional[int] = Field(default=None, ge=0)
    bouquet_id: Optional[int] = None
    is_active: Optional[bool] = None
    is_preorder: Optional[bool] = None
    cost_price: Optional[float] = Field(default=None, ge=0)
    markup_percent: Optional[float] = Field(default=None, ge=0)
    composition: Optional[List[CompositionItem]] = None

    @field_validator("name", "description")
    @classmethod
    def sanitize_text_fields(cls, v: Optional[str]) -> Optional[str]:
        """Sanitize user input to prevent XSS."""
        if v is None:
            return None
        return sanitize_user_input(v, max_length=2000)


class ProductResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    seller_id: int
    name: str
    description: str
    price: float
    photo_id: Optional[str] = None
    photo_ids: Optional[List[str]] = None
    quantity: int
    bouquet_id: Optional[int] = None
    is_active: Optional[bool] = True
    is_preorder: bool = False
    cost_price: Optional[float] = None
    markup_percent: Optional[float] = None
    composition: Optional[list] = None

    @model_validator(mode="after")
    def fill_photo_ids(self):
        if self.photo_ids is None and self.photo_id:
            self.photo_ids = [self.photo_id]
        return self


# --- CRM: Flowers, Receptions ---
class FlowerCreate(BaseModel):
    name: str
    default_shelf_life_days: Optional[int] = None


class ReceptionCreate(BaseModel):
    name: str
    reception_date: Optional[str] = None  # YYYY-MM-DD
    supplier: Optional[str] = None
    invoice_number: Optional[str] = None


class ReceptionUpdate(BaseModel):
    is_closed: Optional[bool] = None
    supplier: Optional[str] = None
    invoice_number: Optional[str] = None


class ReceptionItemCreate(BaseModel):
    flower_id: int
    quantity_initial: int
    arrival_date: Optional[str] = None  # YYYY-MM-DD
    shelf_life_days: int
    price_per_unit: float


class ReceptionItemUpdate(BaseModel):
    remaining_quantity: Optional[int] = None
    quantity_initial: Optional[int] = None
    arrival_date: Optional[str] = None
    shelf_life_days: Optional[int] = None
    price_per_unit: Optional[float] = None


class InventoryCheckLine(BaseModel):
    reception_item_id: int
    actual_quantity: int


# --- CRM: Bouquets ---
class BouquetItemCreate(BaseModel):
    flower_id: int
    quantity: int = Field(ge=1)


class BouquetCreate(BaseModel):
    name: str
    packaging_cost: float = Field(default=0, ge=0)
    items: List[BouquetItemCreate] = Field(min_length=1)

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_user_input(v, max_length=255)