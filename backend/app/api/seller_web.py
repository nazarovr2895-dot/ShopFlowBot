"""Seller web panel API - protected by X-Seller-Token."""
import io
import os
import uuid
from pathlib import Path
from typing import Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, File, Query, UploadFile, HTTPException
from PIL import Image, ImageOps
from pydantic import BaseModel
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_session
from backend.app.api.seller_auth import require_seller_token
from backend.app.core.logging import get_logger
from backend.app.schemas import (
    ProductCreate,
    ProductUpdate,
    FlowerCreate,
    ReceptionCreate,
    ReceptionItemCreate,
    ReceptionItemUpdate,
    InventoryCheckLine,
    BouquetCreate,
)
from backend.app.services.orders import OrderService, OrderServiceError
from backend.app.services.sellers import SellerService, SellerServiceError
from backend.app.services.products import (
    create_product_service,
    get_products_by_seller_service,
    get_product_by_id_service,
    update_product_service,
    delete_product_service,
)
from backend.app.services.receptions import (
    list_flowers,
    create_flower,
    delete_flower,
    list_receptions,
    create_reception,
    get_reception,
    add_reception_item,
    update_reception_item,
    delete_reception_item,
    get_reception_items_for_inventory,
    inventory_check,
)
from backend.app.services.referrals import accrue_commissions
from backend.app.services.bouquets import (
    list_bouquets_with_totals,
    get_bouquet_with_totals,
    create_bouquet as create_bouquet_svc,
    update_bouquet as update_bouquet_svc,
    delete_bouquet as delete_bouquet_svc,
)

router = APIRouter(dependencies=[Depends(require_seller_token)])
logger = get_logger(__name__)

# Директория для загруженных фото (backend/static)
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "static"
PRODUCTS_UPLOAD_SUBDIR = Path("uploads") / "products"
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

# Конвертация загружаемых фото в лёгкий формат (только web seller; Telegram-бот не трогаем)
UPLOAD_MAX_SIDE_PX = 1200
UPLOAD_OUTPUT_QUALITY = 85
UPLOAD_OUTPUT_EXT = ".webp"


def _get_seller_id(seller_id: int = Depends(require_seller_token)) -> int:
    return seller_id


# --- SELLER INFO ---
@router.get("/me")
async def get_me(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Get current seller info including shop link."""
    service = SellerService(session)
    data = await service.get_seller(seller_id)
    if not data:
        return {}
    bot_username = os.getenv("BOT_USERNAME", "")
    if bot_username:
        data["shop_link"] = f"https://t.me/{bot_username}?start=seller_{seller_id}"
    else:
        data["shop_link"] = None
    return data


# --- ORDERS ---
@router.get("/orders")
async def get_orders(
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Get orders for current seller. status=pending|accepted|assembling|in_transit|done|completed|rejected.
    For history (done/completed): use date_from, date_to."""
    service = OrderService(session)
    orders = await service.get_seller_orders(seller_id, status)
    # Filter by date if provided (for order history)
    if date_from or date_to:
        result = []
        for o in orders:
            created = o.get("created_at") or ""
            try:
                if date_from and created[:10] < date_from[:10]:
                    continue
                if date_to and created[:10] > date_to[:10]:
                    continue
            except (IndexError, TypeError):
                pass
            result.append(o)
        return result
    return orders


@router.post("/orders/{order_id}/accept")
async def accept_order(
    order_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    service = OrderService(session)
    try:
        result = await service.accept_order(order_id, verify_seller_id=seller_id)
        await session.commit()
        return result
    except OrderServiceError as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        await session.rollback()
        logger.exception("accept_order failed for order_id=%s", order_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/orders/{order_id}/reject")
async def reject_order(
    order_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    service = OrderService(session)
    try:
        result = await service.reject_order(order_id, verify_seller_id=seller_id)
        await session.commit()
        return result
    except OrderServiceError as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/orders/{order_id}/status")
async def update_order_status(
    order_id: int,
    status: str,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    from backend.app.services.telegram_notify import notify_buyer_order_status
    service = OrderService(session)
    try:
        result = await service.update_status(
            order_id, status, verify_seller_id=seller_id, accrue_commissions_func=accrue_commissions
        )
        await session.commit()
        # Notify buyer in Telegram about status change
        await notify_buyer_order_status(
            buyer_id=result["buyer_id"],
            order_id=order_id,
            new_status=result["new_status"],
            items_info=result.get("items_info"),
            total_price=result.get("total_price"),
        )
        return result
    except OrderServiceError as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        await session.rollback()
        logger.exception("update_order_status failed for order_id=%s status=%s", order_id, status)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/orders/{order_id}/price")
async def update_order_price(
    order_id: int,
    new_price: float,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from decimal import Decimal
    from fastapi import HTTPException
    service = OrderService(session)
    try:
        result = await service.update_order_price(order_id, Decimal(str(new_price)), seller_id)
        await session.commit()
        return result
    except OrderServiceError as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        await session.rollback()
        logger.exception("update_order_price failed for order_id=%s", order_id)
        raise HTTPException(status_code=500, detail=str(e))


# --- STATS ---
@router.get("/stats")
async def get_stats(
    period: Optional[str] = Query(None, description="Predefined range: 1d, 7d, 30d"),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Get order stats for current seller."""

    def _parse_date(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            return None

    start_date = _parse_date(date_from)
    end_date = _parse_date(date_to)
    applied_period: Optional[str] = None

    if start_date and not end_date:
        end_date = start_date
    elif end_date and not start_date:
        start_date = end_date
    if start_date and end_date and start_date > end_date:
        start_date, end_date = end_date, start_date

    period_key = (period or "").lower()
    if not start_date and not end_date and period_key in {"1d", "7d", "30d"}:
        today = datetime.utcnow().date()
        if period_key == "1d":
            start_day = today
        elif period_key == "7d":
            start_day = today - timedelta(days=6)
        else:
            start_day = today - timedelta(days=29)
        start_date = datetime.combine(start_day, datetime.min.time())
        end_date = datetime.combine(today, datetime.min.time())
        applied_period = period_key
    elif start_date or end_date:
        applied_period = "custom"

    service = OrderService(session)
    stats = await service.get_seller_stats(
        seller_id,
        date_from=start_date,
        date_to=end_date,
    )
    stats.setdefault("filters", {})
    stats["filters"]["period"] = applied_period
    return stats


# --- PRODUCTS ---
@router.get("/products")
async def get_products(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    products = await get_products_by_seller_service(session, seller_id, only_available=False)
    return products or []


@router.post("/products")
async def add_product(
    data: ProductCreate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    if data.seller_id != seller_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    product_data = {
        "seller_id": data.seller_id,
        "name": data.name,
        "description": data.description,
        "price": data.price,
        "quantity": data.quantity,
    }
    if data.photo_ids is not None:
        product_data["photo_ids"] = data.photo_ids
    elif data.photo_id is not None:
        product_data["photo_id"] = data.photo_id
    if data.bouquet_id is not None:
        product_data["bouquet_id"] = data.bouquet_id
    return await create_product_service(session, product_data)


@router.put("/products/{product_id}")
async def update_product(
    product_id: int,
    data: ProductUpdate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    product = await get_product_by_id_service(session, product_id)
    if not product or product.seller_id != seller_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Товар не найден")
    update_data = data.model_dump(exclude_unset=True)
    return await update_product_service(session, product_id, update_data)


@router.delete("/products/{product_id}")
async def delete_product(
    product_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    product = await get_product_by_id_service(session, product_id)
    if not product or product.seller_id != seller_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Товар не найден")
    await delete_product_service(session, product_id)
    return {"status": "deleted"}


def _convert_uploaded_image(content: bytes) -> bytes:
    """Открыть изображение, повернуть по EXIF, уменьшить по длинной стороне, сохранить в WebP."""
    try:
        img = Image.open(io.BytesIO(content))
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        w, h = img.size
        if max(w, h) > UPLOAD_MAX_SIDE_PX:
            ratio = UPLOAD_MAX_SIDE_PX / max(w, h)
            new_size = (int(w * ratio), int(h * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, "WEBP", quality=UPLOAD_OUTPUT_QUALITY)
        return out.getvalue()
    except Exception as e:
        logger.warning("Image conversion failed: %s", e)
        raise HTTPException(status_code=400, detail="Не удалось обработать изображение") from e


@router.post("/upload-photo")
async def upload_product_photo(
    file: UploadFile = File(...),
    seller_id: int = Depends(require_seller_token),
):
    """Загрузка фото товара. Конвертируется в WebP с уменьшением размера. Возвращает photo_id."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Файл не выбран")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Допустимые форматы: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}",
        )
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10 MB
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 10 МБ)")
    content = _convert_uploaded_image(content)
    upload_dir = UPLOAD_DIR / PRODUCTS_UPLOAD_SUBDIR
    upload_dir.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{UPLOAD_OUTPUT_EXT}"
    path = upload_dir / name
    path.write_bytes(content)
    photo_id = f"/static/{PRODUCTS_UPLOAD_SUBDIR}/{name}"
    return {"photo_id": photo_id}


def _handle_crm_db_error(e: Exception) -> None:
    """Raise 503 with clear message if CRM tables are missing (migration not run)."""
    logger.exception("CRM API error: %s", e)
    if isinstance(e, (OperationalError, ProgrammingError)):
        msg = str(e).lower()
        if "does not exist" in msg or "undefined_table" in msg or "relation" in msg:
            raise HTTPException(
                status_code=503,
                detail="CRM tables not found. Run migrations in backend: cd backend && alembic upgrade head",
            ) from e
    raise e


# --- FLOWERS (catalog) ---
@router.get("/flowers")
async def api_list_flowers(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    try:
        flowers = await list_flowers(session, seller_id)
        return [{"id": f.id, "name": f.name, "default_shelf_life_days": f.default_shelf_life_days} for f in flowers]
    except Exception as e:
        _handle_crm_db_error(e)
        raise


@router.post("/flowers")
async def api_create_flower(
    data: FlowerCreate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    try:
        flower = await create_flower(
            session, seller_id, data.name, data.default_shelf_life_days
        )
        return {"id": flower.id, "name": flower.name, "default_shelf_life_days": flower.default_shelf_life_days}
    except Exception as e:
        _handle_crm_db_error(e)
        raise


@router.delete("/flowers/{flower_id}")
async def api_delete_flower(
    flower_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    ok = await delete_flower(session, flower_id, seller_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Цветок не найден")
    return {"status": "deleted"}


# --- RECEPTIONS ---
@router.get("/receptions")
async def api_list_receptions(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    try:
        return await list_receptions(session, seller_id)
    except Exception as e:
        _handle_crm_db_error(e)
        raise


@router.post("/receptions")
async def api_create_reception(
    data: ReceptionCreate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from datetime import datetime
    rec_date = None
    if data.reception_date:
        try:
            rec_date = datetime.strptime(data.reception_date, "%Y-%m-%d").date()
        except ValueError:
            pass
    rec = await create_reception(session, seller_id, data.name, rec_date)
    return {
        "id": rec.id,
        "name": rec.name,
        "reception_date": rec.reception_date.isoformat() if rec.reception_date else None,
    }


@router.get("/receptions/{reception_id}")
async def api_get_reception(
    reception_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    rec = await get_reception(session, reception_id, seller_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Приёмка не найдена")
    return rec


@router.post("/receptions/{reception_id}/items")
async def api_add_reception_item(
    reception_id: int,
    data: ReceptionItemCreate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    from datetime import datetime
    arr_date = None
    if data.arrival_date:
        try:
            arr_date = datetime.strptime(data.arrival_date, "%Y-%m-%d").date()
        except ValueError:
            pass
    item = await add_reception_item(
        session,
        reception_id,
        seller_id,
        data.flower_id,
        data.quantity_initial,
        arr_date,
        data.shelf_life_days,
        data.price_per_unit,
    )
    if not item:
        raise HTTPException(status_code=400, detail="Приёмка или цветок не найдены")
    return {
        "id": item.id,
        "flower_id": item.flower_id,
        "quantity_initial": item.quantity_initial,
        "arrival_date": item.arrival_date.isoformat() if item.arrival_date else None,
        "shelf_life_days": item.shelf_life_days,
        "price_per_unit": float(item.price_per_unit),
        "remaining_quantity": item.remaining_quantity,
        "sold_quantity": item.sold_quantity,
        "sold_amount": float(item.sold_amount),
    }


@router.put("/receptions/items/{item_id}")
async def api_update_reception_item(
    item_id: int,
    data: ReceptionItemUpdate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    from datetime import datetime
    kwargs = data.model_dump(exclude_unset=True)
    if "arrival_date" in kwargs and kwargs["arrival_date"]:
        try:
            kwargs["arrival_date"] = datetime.strptime(kwargs["arrival_date"], "%Y-%m-%d").date()
        except ValueError:
            kwargs.pop("arrival_date", None)
    item = await update_reception_item(session, item_id, seller_id, **kwargs)
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    return {
        "id": item.id,
        "remaining_quantity": item.remaining_quantity,
        "quantity_initial": item.quantity_initial,
        "arrival_date": item.arrival_date.isoformat() if item.arrival_date else None,
        "shelf_life_days": item.shelf_life_days,
        "price_per_unit": float(item.price_per_unit),
        "sold_quantity": item.sold_quantity,
        "sold_amount": float(item.sold_amount),
    }


@router.delete("/receptions/items/{item_id}")
async def api_delete_reception_item(
    item_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    ok = await delete_reception_item(session, item_id, seller_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    return {"status": "deleted"}


# --- BOUQUETS ---
@router.get("/bouquets")
async def api_list_bouquets(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    return await list_bouquets_with_totals(session, seller_id)


@router.get("/bouquets/{bouquet_id}")
async def api_get_bouquet(
    bouquet_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    b = await get_bouquet_with_totals(session, bouquet_id, seller_id)
    if not b:
        raise HTTPException(status_code=404, detail="Букет не найден")
    return b


@router.post("/bouquets")
async def api_create_bouquet(
    data: BouquetCreate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    items = [{"flower_id": i.flower_id, "quantity": i.quantity, "markup_multiplier": i.markup_multiplier} for i in data.items]
    try:
        b = await create_bouquet_svc(
            session, seller_id, data.name, data.packaging_cost, items
        )
        return await get_bouquet_with_totals(session, b.id, seller_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/bouquets/{bouquet_id}")
async def api_update_bouquet(
    bouquet_id: int,
    data: BouquetCreate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    items = [{"flower_id": i.flower_id, "quantity": i.quantity, "markup_multiplier": i.markup_multiplier} for i in data.items]
    try:
        b = await update_bouquet_svc(
            session, bouquet_id, seller_id, data.name, data.packaging_cost, items
        )
        if not b:
            raise HTTPException(status_code=404, detail="Букет не найден")
        return await get_bouquet_with_totals(session, bouquet_id, seller_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/bouquets/{bouquet_id}")
async def api_delete_bouquet(
    bouquet_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    ok = await delete_bouquet_svc(session, bouquet_id, seller_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Букет не найден")
    return {"status": "deleted"}


# --- INVENTORY ---
@router.get("/receptions/{reception_id}/inventory")
async def api_get_reception_inventory(
    reception_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    rec_result = await get_reception(session, reception_id, seller_id)
    if not rec_result:
        raise HTTPException(status_code=404, detail="Приёмка не найдена")
    items = await get_reception_items_for_inventory(session, reception_id, seller_id)
    return {"reception_id": reception_id, "items": items}


@router.post("/receptions/{reception_id}/inventory/check")
async def api_inventory_check(
    reception_id: int,
    body: list[InventoryCheckLine],
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    rec_result = await get_reception(session, reception_id, seller_id)
    if not rec_result:
        raise HTTPException(status_code=404, detail="Приёмка не найдена")
    lines = [{"reception_item_id": x.reception_item_id, "actual_quantity": x.actual_quantity} for x in body]
    return await inventory_check(session, reception_id, seller_id, lines)


# --- SECURITY ---
class ChangeCredentialsBody(BaseModel):
    old_login: str
    old_password: str
    new_login: str
    new_password: str


@router.put("/security/change-credentials")
async def change_credentials(
    body: ChangeCredentialsBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Change web login and password. Requires current credentials for verification."""
    service = SellerService(session)
    try:
        return await service.change_web_credentials(
            seller_id,
            body.old_login,
            body.old_password,
            body.new_login,
            body.new_password,
        )
    except SellerServiceError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=e.status_code, detail=e.message)


# --- LIMITS ---
@router.put("/limits")
async def update_limits(
    max_orders: int = Query(...),
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    service = SellerService(session)
    try:
        return await service.update_limits(seller_id, max_orders)
    except SellerServiceError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=e.status_code, detail=e.message)
