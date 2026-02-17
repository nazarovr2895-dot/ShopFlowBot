"""Seller web panel API - protected by X-Seller-Token."""
import csv
import io
import os
import uuid
from pathlib import Path
from typing import Optional, List
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Query, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from PIL import Image, ImageOps
from pydantic import BaseModel
from sqlalchemy import select
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
    ReceptionUpdate,
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
    update_reception,
    get_reception,
    add_reception_item,
    update_reception_item,
    delete_reception_item,
    get_reception_items_for_inventory,
    get_expiring_items,
    inventory_check,
    inventory_apply,
    ReceptionClosedError,
    write_off_item,
    get_write_offs,
    get_write_off_stats,
    WriteOffError,
    get_all_items_for_inventory,
    global_inventory_check,
    global_inventory_apply,
)
from backend.app.services.referrals import accrue_commissions
from backend.app.services.loyalty import (
    LoyaltyService,
    LoyaltyServiceError,
    CustomerNotFoundError,
    DuplicatePhoneError,
)
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
SHOP_BANNERS_UPLOAD_SUBDIR = Path("uploads") / "shop_banners"
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

# Конвертация загружаемых фото в лёгкий формат (только web seller; Telegram-бот не трогаем)
UPLOAD_MAX_SIDE_PX = 1200
UPLOAD_BANNER_MAX_SIDE_PX = 1920  # banner (YouTube-style) can be larger
UPLOAD_OUTPUT_QUALITY = 85
UPLOAD_OUTPUT_EXT = ".webp"


def _get_seller_id(seller_id: int = Depends(require_seller_token)) -> int:
    return seller_id


# --- SELLER INFO ---
class UpdateMeBody(BaseModel):
    """Optional profile fields for seller (e.g. hashtags, preorder schedule, shop settings)."""
    hashtags: Optional[str] = None
    preorder_enabled: Optional[bool] = None
    preorder_schedule_type: Optional[str] = None  # 'weekly' | 'interval_days' | 'custom_dates'
    preorder_weekday: Optional[int] = None  # 0=Mon, 6=Sun
    preorder_interval_days: Optional[int] = None
    preorder_base_date: Optional[str] = None  # YYYY-MM-DD
    preorder_custom_dates: Optional[List[str]] = None  # List of YYYY-MM-DD dates
    # Shop settings
    shop_name: Optional[str] = None
    description: Optional[str] = None
    delivery_type: Optional[str] = None  # 'доставка', 'самовывоз', 'доставка и самовывоз'
    delivery_price: Optional[float] = None
    address_name: Optional[str] = None
    map_url: Optional[str] = None
    banner_url: Optional[str] = None  # set to empty string or null to remove banner


@router.get("/me")
async def get_me(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Get current seller info including shop link and hashtags."""
    try:
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
    except (ProgrammingError, OperationalError) as e:
        # If it's a column error (preorder_custom_dates doesn't exist), return error suggesting migration
        error_msg = str(e).lower()
        if 'column' in error_msg and ('does not exist' in error_msg or 'не существует' in error_msg or 'preorder_custom_dates' in error_msg):
            raise HTTPException(
                status_code=500,
                detail="Database schema mismatch: preorder_custom_dates column missing. Please run migration: alembic upgrade head"
            )
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        logger.exception("Error in get_me endpoint", seller_id=seller_id, error=str(e))
        raise


@router.put("/me")
async def update_me(
    body: UpdateMeBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Update current seller profile (e.g. hashtags, preorder schedule, shop settings)."""
    from backend.app.models.seller import Seller
    service = SellerService(session)
    if body.hashtags is not None:
        await service.update_field(seller_id, "hashtags", body.hashtags)
    # Shop settings
    if body.shop_name is not None:
        await service.update_field(seller_id, "shop_name", body.shop_name)
    if body.description is not None:
        await service.update_field(seller_id, "description", body.description)
    if body.delivery_type is not None:
        await service.update_field(seller_id, "delivery_type", body.delivery_type)
    if body.delivery_price is not None:
        await service.update_field(seller_id, "delivery_price", body.delivery_price)
    if body.address_name is not None:
        await service.update_field(seller_id, "address_name", body.address_name)
    if body.map_url is not None:
        await service.update_field(seller_id, "map_url", body.map_url)
    if body.banner_url is not None:
        await service.update_field(seller_id, "banner_url", body.banner_url or "")
    result = await session.execute(select(Seller).where(Seller.seller_id == seller_id))
    seller = result.scalar_one_or_none()
    if seller:
        if body.preorder_enabled is not None:
            seller.preorder_enabled = body.preorder_enabled
        if body.preorder_schedule_type is not None:
            seller.preorder_schedule_type = body.preorder_schedule_type
        if body.preorder_weekday is not None:
            seller.preorder_weekday = body.preorder_weekday
        if body.preorder_interval_days is not None:
            seller.preorder_interval_days = body.preorder_interval_days
        if body.preorder_base_date is not None:
            if body.preorder_base_date and body.preorder_base_date.strip():
                try:
                    seller.preorder_base_date = datetime.strptime(body.preorder_base_date[:10], "%Y-%m-%d").date()
                except (ValueError, TypeError):
                    seller.preorder_base_date = None
            else:
                seller.preorder_base_date = None
        if body.preorder_custom_dates is not None:
            # Validate dates are YYYY-MM-DD format
            validated_dates = []
            for d_str in body.preorder_custom_dates:
                try:
                    datetime.strptime(d_str[:10], "%Y-%m-%d")
                    validated_dates.append(d_str[:10])
                except (ValueError, TypeError):
                    continue
            # Check if column exists in model (catch AttributeError if not)
            try:
                seller.preorder_custom_dates = validated_dates if validated_dates else None
            except (AttributeError, ProgrammingError, OperationalError) as e:
                logger.warning(
                    "preorder_custom_dates column not available",
                    seller_id=seller_id,
                    error=str(e)
                )
                # Ignore if column doesn't exist (migration not applied)
        await session.commit()
    data = await service.get_seller(seller_id)
    if not data:
        return {}
    bot_username = os.getenv("BOT_USERNAME", "")
    data["shop_link"] = f"https://t.me/{bot_username}?start=seller_{seller_id}" if bot_username else None
    return data


@router.get("/dashboard/alerts")
async def get_dashboard_alerts(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Low stock bouquets (can_assemble_count <= 2) and expiring reception items (days_left <= 2)."""
    bouquets = await list_bouquets_with_totals(session, seller_id)
    low_stock_bouquets = [
        {"id": b["id"], "name": b["name"], "can_assemble_count": b.get("can_assemble_count", 0)}
        for b in bouquets
        if b.get("can_assemble_count", 0) <= 2
    ]
    expiring_items = await get_expiring_items(session, seller_id, days_left_max=2)
    return {"low_stock_bouquets": low_stock_bouquets, "expiring_items": expiring_items}


# --- ORDERS ---
@router.get("/orders")
async def get_orders(
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    preorder: Optional[bool] = Query(None, description="Filter by is_preorder: true=preorders only"),
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Get orders for current seller. status=pending|accepted|assembling|in_transit|done|completed|rejected.
    For history (done/completed): use date_from, date_to. preorder=true for preorders only."""
    service = OrderService(session)
    orders = await service.get_seller_orders(seller_id, status, preorder=preorder)
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


@router.get("/orders/{order_id}")
async def get_order(
    order_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    service = OrderService(session)
    order = await service.get_seller_order_by_id(seller_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    return order


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
        # Sync bouquet product quantities after stock deduction
        try:
            from backend.app.services.bouquets import sync_bouquet_product_quantities
            await sync_bouquet_product_quantities(session, seller_id)
            await session.commit()
        except Exception:
            logger.exception("sync_bouquet_product_quantities failed after accept_order")
        from backend.app.services.telegram_notify import notify_buyer_order_status
        await notify_buyer_order_status(
            buyer_id=result["buyer_id"],
            order_id=order_id,
            new_status=result["new_status"],
            seller_id=result["seller_id"],
            items_info=result.get("items_info"),
            total_price=result.get("total_price"),
        )
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
        from backend.app.services.telegram_notify import notify_buyer_order_status
        await notify_buyer_order_status(
            buyer_id=result["buyer_id"],
            order_id=order_id,
            new_status=result["new_status"],
            seller_id=result["seller_id"],
            items_info=result.get("items_info"),
            total_price=result.get("total_price"),
        )
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
            seller_id=result["seller_id"],
            items_info=result.get("items_info"),
            total_price=result.get("total_price"),
        )
        if result["new_status"] == "completed":
            from backend.app.services.telegram_notify import notify_seller_order_completed
            await notify_seller_order_completed(
                seller_id=result["seller_id"],
                order_id=order_id,
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
        from backend.app.services.telegram_notify import notify_buyer_order_price_changed
        await notify_buyer_order_price_changed(
            buyer_id=result["buyer_id"],
            order_id=result["order_id"],
            seller_id=result["seller_id"],
            new_price=result["total_price"],
            items_info=result.get("items_info", ""),
        )
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
        # Use Moscow timezone for day boundaries
        MSK = ZoneInfo("Europe/Moscow")
        today_msk = datetime.now(MSK).date()
        if period_key == "1d":
            start_day_msk = today_msk
        elif period_key == "7d":
            start_day_msk = today_msk - timedelta(days=6)
        else:
            start_day_msk = today_msk - timedelta(days=29)
        # Create datetime boundaries in MSK (00:00:00 to 23:59:59)
        start_datetime_msk = datetime.combine(start_day_msk, datetime.min.time()).replace(tzinfo=MSK)
        end_datetime_msk = datetime.combine(today_msk, datetime.max.time()).replace(tzinfo=MSK)
        # Convert to UTC for database queries (DB stores UTC timestamps)
        start_date = start_datetime_msk.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        end_date = end_datetime_msk.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
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


@router.get("/stats/export")
async def export_stats_csv(
    period: Optional[str] = Query(None, description="Predefined range: 1d, 7d, 30d"),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Export statistics to CSV file."""
    # Reuse date calculation logic from get_stats
    def _parse_date(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            return None

    start_date = _parse_date(date_from)
    end_date = _parse_date(date_to)

    if start_date and not end_date:
        end_date = start_date
    elif end_date and not start_date:
        start_date = end_date
    if start_date and end_date and start_date > end_date:
        start_date, end_date = end_date, start_date

    period_key = (period or "").lower()
    if not start_date and not end_date and period_key in {"1d", "7d", "30d"}:
        # Use Moscow timezone for day boundaries
        MSK = ZoneInfo("Europe/Moscow")
        today_msk = datetime.now(MSK).date()
        if period_key == "1d":
            start_day_msk = today_msk
        elif period_key == "7d":
            start_day_msk = today_msk - timedelta(days=6)
        else:
            start_day_msk = today_msk - timedelta(days=29)
        start_datetime_msk = datetime.combine(start_day_msk, datetime.min.time()).replace(tzinfo=MSK)
        end_datetime_msk = datetime.combine(today_msk, datetime.max.time()).replace(tzinfo=MSK)
        start_date = start_datetime_msk.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        end_date = end_datetime_msk.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

    # Get stats
    service = OrderService(session)
    stats = await service.get_seller_stats(seller_id, date_from=start_date, date_to=end_date)

    # Build CSV
    output = io.StringIO()
    output.write('\ufeff')  # BOM for Excel
    writer = csv.writer(output, delimiter=';')

    # Headers
    writer.writerow(['Дата', 'Заказов', 'Выручка (₽)'])

    # Daily breakdown
    for day_stat in stats.get('daily_sales', []):
        writer.writerow([
            day_stat.get('date', ''),
            day_stat.get('orders', 0),
            f"{day_stat.get('revenue', 0):.2f}",
        ])

    # Total row
    writer.writerow([])
    writer.writerow(['ИТОГО', '', ''])
    completed_revenue = stats.get('completed_orders_revenue', 0)
    completed_count = stats.get('completed_orders_count', 0)
    commission = completed_revenue * 0.05  # 5% commission
    net_amount = completed_revenue - commission

    writer.writerow(['Заказов всего', completed_count, ''])
    writer.writerow(['Выручка всего', '', f"{completed_revenue:.2f}"])
    writer.writerow(['Комиссия платформы (5%)', '', f"{commission:.2f}"])
    writer.writerow(['К получению', '', f"{net_amount:.2f}"])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),
        media_type='text/csv; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename="stats_{datetime.now().strftime("%Y%m%d")}.csv"'}
    )


@router.get("/stats/customers")
async def get_customer_stats(
    period: Optional[str] = Query(None, description="Predefined range: 1d, 7d, 30d"),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Customer metrics: new vs returning, retention, LTV, top customers."""

    def _parse_date(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            return None

    start_date = _parse_date(date_from)
    end_date = _parse_date(date_to)

    if start_date and not end_date:
        end_date = start_date
    elif end_date and not start_date:
        start_date = end_date
    if start_date and end_date and start_date > end_date:
        start_date, end_date = end_date, start_date

    period_key = (period or "").lower()
    if not start_date and not end_date and period_key in {"1d", "7d", "30d"}:
        MSK = ZoneInfo("Europe/Moscow")
        today_msk = datetime.now(MSK).date()
        if period_key == "1d":
            start_day_msk = today_msk
        elif period_key == "7d":
            start_day_msk = today_msk - timedelta(days=6)
        else:
            start_day_msk = today_msk - timedelta(days=29)
        start_datetime_msk = datetime.combine(start_day_msk, datetime.min.time()).replace(tzinfo=MSK)
        end_datetime_msk = datetime.combine(today_msk, datetime.max.time()).replace(tzinfo=MSK)
        start_date = start_datetime_msk.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        end_date = end_datetime_msk.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

    service = OrderService(session)
    return await service.get_customer_stats(seller_id, date_from=start_date, date_to=end_date)


# --- PRODUCTS ---
@router.get("/products")
async def get_products(
    preorder: Optional[bool] = Query(None, description="Filter by is_preorder: true=preorder only, false=regular only"),
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    products = await get_products_by_seller_service(
        session, seller_id, only_available=False, preorder=preorder
    )
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
        "is_preorder": getattr(data, "is_preorder", False),
    }
    if data.photo_ids is not None:
        product_data["photo_ids"] = data.photo_ids
    elif data.photo_id is not None:
        product_data["photo_id"] = data.photo_id
    if data.bouquet_id is not None:
        product_data["bouquet_id"] = data.bouquet_id
    if data.cost_price is not None:
        product_data["cost_price"] = data.cost_price
    if data.markup_percent is not None:
        product_data["markup_percent"] = data.markup_percent
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


def _validate_image_content(content: bytes) -> bool:
    """Validate that content is actually an image (delegate to core)."""
    from backend.app.core.image_convert import validate_image_content
    return validate_image_content(content)


def _convert_image_to_webp(content: bytes, max_side_px: int) -> bytes:
    """Общий конвертер (делегирует в core); при ошибке — HTTPException 400."""
    from backend.app.core.image_convert import convert_image_to_webp
    try:
        return convert_image_to_webp(content, max_side_px, quality=UPLOAD_OUTPUT_QUALITY)
    except ValueError as e:
        logger.warning("Image conversion failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/upload-photo")
async def upload_product_photo(
    file: UploadFile = File(...),
    seller_id: int = Depends(require_seller_token),
):
    """Загрузка фото товара. Конвертируется в WebP с уменьшением размера. Возвращает photo_id.
    
    Security: Validates file extension, MIME type, and image content.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Файл не выбран")
    
    # Validate file extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Допустимые форматы: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}",
        )
    
    # Validate MIME type
    if file.content_type:
        allowed_mime_types = {
            "image/jpeg", "image/jpg", "image/png", 
            "image/webp", "image/gif"
        }
        if file.content_type not in allowed_mime_types:
            raise HTTPException(
                status_code=400,
                detail=f"Недопустимый тип файла: {file.content_type}"
            )
    
    content = await file.read()
    
    # Validate file size
    if len(content) > 10 * 1024 * 1024:  # 10 MB
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 10 МБ)")
    
    # Validate minimum size (prevent empty files)
    if len(content) < 100:  # Minimum 100 bytes
        raise HTTPException(status_code=400, detail="Файл слишком маленький")
    
    # Convert to WebP (same converter as banner: PNG/heavy images get compressed)
    content = _convert_image_to_webp(content, UPLOAD_MAX_SIDE_PX)
    
    # Secure file path generation
    upload_dir = UPLOAD_DIR / PRODUCTS_UPLOAD_SUBDIR
    upload_dir.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{UPLOAD_OUTPUT_EXT}"
    path = upload_dir / name
    
    # Ensure path is within upload directory (prevent path traversal)
    try:
        path.resolve().relative_to(upload_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Недопустимый путь к файлу")
    
    path.write_bytes(content)
    photo_id = f"/static/{PRODUCTS_UPLOAD_SUBDIR}/{name}"
    return {"photo_id": photo_id}


@router.post("/upload-banner")
async def upload_shop_banner(
    file: UploadFile = File(...),
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Upload shop banner (YouTube-style). One per seller, overwrites previous. Returns banner_url."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Файл не выбран")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Допустимые форматы: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}",
        )
    if file.content_type:
        allowed_mime = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}
        if file.content_type not in allowed_mime:
            raise HTTPException(status_code=400, detail=f"Недопустимый тип файла: {file.content_type}")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 10 МБ)")
    if len(content) < 100:
        raise HTTPException(status_code=400, detail="Файл слишком маленький")
    content = _convert_image_to_webp(content, UPLOAD_BANNER_MAX_SIDE_PX)
    upload_dir = UPLOAD_DIR / SHOP_BANNERS_UPLOAD_SUBDIR
    upload_dir.mkdir(parents=True, exist_ok=True)
    name = f"{seller_id}{UPLOAD_OUTPUT_EXT}"
    path = upload_dir / name
    try:
        path.resolve().relative_to(upload_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Недопустимый путь к файлу")
    path.write_bytes(content)
    banner_url = f"/static/{SHOP_BANNERS_UPLOAD_SUBDIR}/{name}"
    service = SellerService(session)
    await service.update_field(seller_id, "banner_url", banner_url)
    return {"banner_url": banner_url}


def _handle_crm_db_error(e: Exception) -> None:
    """Raise 503 with clear message if CRM tables are missing (migration not run)."""
    logger.exception("CRM API error: %s", e)
    if isinstance(e, (OperationalError, ProgrammingError)):
        msg = str(e).lower()
        if "does not exist" in msg or "undefined_table" in msg or "relation" in msg or "column" in msg:
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
    rec = await create_reception(
        session, seller_id, data.name, rec_date,
        supplier=data.supplier, invoice_number=data.invoice_number,
    )
    return {
        "id": rec.id,
        "name": rec.name,
        "reception_date": rec.reception_date.isoformat() if rec.reception_date else None,
        "is_closed": getattr(rec, "is_closed", False),
        "supplier": getattr(rec, "supplier", None),
        "invoice_number": getattr(rec, "invoice_number", None),
    }


@router.put("/receptions/{reception_id}")
async def api_update_reception(
    reception_id: int,
    data: ReceptionUpdate,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    kwargs = data.model_dump(exclude_unset=True)
    rec = await update_reception(session, reception_id, seller_id, **kwargs)
    if not rec:
        raise HTTPException(status_code=404, detail="Приёмка не найдена")
    return {
        "id": rec.id,
        "name": rec.name,
        "reception_date": rec.reception_date.isoformat() if rec.reception_date else None,
        "is_closed": getattr(rec, "is_closed", False),
        "supplier": getattr(rec, "supplier", None),
        "invoice_number": getattr(rec, "invoice_number", None),
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
    try:
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
    except ReceptionClosedError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not item:
        raise HTTPException(status_code=400, detail="Приёмка или цветок не найдены")
    resp = {
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
    # Sync bouquet product quantities after new reception item
    try:
        from backend.app.services.bouquets import sync_bouquet_product_quantities
        await sync_bouquet_product_quantities(session, seller_id)
        await session.commit()
    except Exception:
        logger.exception("sync_bouquet_product_quantities failed after add_reception_item")
    return resp


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
    items = [{"flower_id": i.flower_id, "quantity": i.quantity} for i in data.items]
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
    items = [{"flower_id": i.flower_id, "quantity": i.quantity} for i in data.items]
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


# --- PRODUCT RECALCULATE ---
@router.post("/products/{product_id}/recalculate")
async def api_recalculate_product_price(
    product_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    product = await get_product_by_id_service(session, product_id)
    if not product or product.seller_id != seller_id:
        raise HTTPException(status_code=404, detail="Товар не найден")
    if not product.bouquet_id:
        raise HTTPException(status_code=400, detail="Товар не привязан к букету")

    bouquet_data = await get_bouquet_with_totals(session, product.bouquet_id, seller_id)
    if not bouquet_data:
        raise HTTPException(status_code=404, detail="Букет не найден")

    new_cost = bouquet_data["total_price"]  # себестоимость (цветы + упаковка)
    update: dict = {"cost_price": new_cost}

    if product.markup_percent is not None:
        update["price"] = round(new_cost * (1 + float(product.markup_percent) / 100), 2)

    update["quantity"] = bouquet_data.get("can_assemble_count", 0)

    updated = await update_product_service(session, product_id, update)
    return {
        "id": updated.id,
        "name": updated.name,
        "price": float(updated.price),
        "cost_price": float(updated.cost_price) if updated.cost_price else None,
        "markup_percent": float(updated.markup_percent) if updated.markup_percent else None,
        "quantity": updated.quantity,
    }


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


@router.post("/receptions/{reception_id}/inventory/apply")
async def api_inventory_apply(
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
    result = await inventory_apply(session, reception_id, seller_id, lines)
    await session.commit()
    # Sync bouquet product quantities after inventory adjustment
    try:
        from backend.app.services.bouquets import sync_bouquet_product_quantities
        await sync_bouquet_product_quantities(session, seller_id)
        await session.commit()
    except Exception:
        logger.exception("sync_bouquet_product_quantities failed after inventory_apply")
    return result


# --- WRITE-OFF (quick flower disposal) ---
class WriteOffBody(BaseModel):
    quantity: int
    reason: str  # wilted, broken, defect, other
    comment: Optional[str] = None


@router.post("/receptions/items/{item_id}/write-off")
async def api_write_off_item(
    item_id: int,
    body: WriteOffBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    try:
        result = await write_off_item(
            session, item_id, seller_id,
            quantity=body.quantity,
            reason=body.reason,
            comment=body.comment,
        )
        # Sync bouquet product quantities after write-off
        try:
            from backend.app.services.bouquets import sync_bouquet_product_quantities
            await sync_bouquet_product_quantities(session, seller_id)
            await session.commit()
        except Exception:
            logger.exception("sync_bouquet_product_quantities failed after write_off")
        return result
    except WriteOffError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/write-offs")
async def api_get_write_offs(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    from datetime import date as date_type
    df = date_type.fromisoformat(date_from) if date_from else None
    dt = date_type.fromisoformat(date_to) if date_to else None
    return await get_write_offs(session, seller_id, df, dt)


@router.get("/write-offs/stats")
async def api_get_write_off_stats(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    """Aggregated waste report: totals, by reason, by flower, daily series."""
    from datetime import date as date_type
    df = date_type.fromisoformat(date_from) if date_from else None
    dt = date_type.fromisoformat(date_to) if date_to else None
    return await get_write_off_stats(session, seller_id, df, dt)


# --- LOYALTY / CUSTOMERS ---
class LoyaltySettingsBody(BaseModel):
    points_percent: float
    max_points_discount_percent: Optional[int] = None
    points_to_ruble_rate: Optional[float] = None
    tiers_config: Optional[List[dict]] = None
    points_expire_days: Optional[int] = None


class CreateCustomerBody(BaseModel):
    phone: str
    first_name: str
    last_name: str
    birthday: Optional[str] = None


class RecordSaleBody(BaseModel):
    amount: float


class DeductPointsBody(BaseModel):
    points: float


class UpdateCustomerBody(BaseModel):
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    birthday: Optional[str] = "__unset__"


@router.get("/loyalty/settings")
async def get_loyalty_settings(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from backend.app.models.seller import Seller
    seller = await session.get(Seller, seller_id)
    return {
        "points_percent": float(seller.loyalty_points_percent or 0) if seller else 0,
        "max_points_discount_percent": seller.max_points_discount_percent if seller else 100,
        "points_to_ruble_rate": float(seller.points_to_ruble_rate or 1) if seller else 1,
        "tiers_config": seller.loyalty_tiers_config if seller else None,
        "points_expire_days": seller.points_expire_days if seller else None,
    }


@router.put("/loyalty/settings")
async def update_loyalty_settings(
    body: LoyaltySettingsBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from decimal import Decimal
    from backend.app.models.seller import Seller
    seller = await session.get(Seller, seller_id)
    if not seller:
        raise HTTPException(status_code=404, detail="Продавец не найден")
    seller.loyalty_points_percent = Decimal(str(body.points_percent))
    if body.max_points_discount_percent is not None:
        seller.max_points_discount_percent = body.max_points_discount_percent
    if body.points_to_ruble_rate is not None:
        seller.points_to_ruble_rate = Decimal(str(body.points_to_ruble_rate))
    if body.tiers_config is not None:
        seller.loyalty_tiers_config = body.tiers_config if body.tiers_config else None
    if body.points_expire_days is not None:
        seller.points_expire_days = body.points_expire_days if body.points_expire_days > 0 else None
    await session.commit()
    return {
        "points_percent": float(seller.loyalty_points_percent),
        "max_points_discount_percent": seller.max_points_discount_percent,
        "points_to_ruble_rate": float(seller.points_to_ruble_rate or 1),
        "tiers_config": seller.loyalty_tiers_config,
        "points_expire_days": seller.points_expire_days,
    }


@router.get("/customers/tags")
async def get_customer_tags(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Get all unique tags used by seller's customers (for autocomplete)."""
    svc = LoyaltyService(session)
    return await svc.get_all_tags(seller_id)


@router.get("/customers/segments")
async def get_customer_segments(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Get RFM segments summary for all customers."""
    from backend.app.services.loyalty import get_customer_segments as _get_segments
    return await _get_segments(session, seller_id)


@router.get("/loyalty/expiring")
async def get_expiring_points(
    days: int = 30,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Get customers with points expiring within N days."""
    from backend.app.services.loyalty import get_expiring_points as _get_expiring
    return await _get_expiring(session, seller_id, days)


@router.get("/customers")
async def list_customers(
    tag: Optional[str] = None,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    svc = LoyaltyService(session)
    return await svc.list_customers(seller_id, tag_filter=tag)


@router.post("/customers")
async def create_customer(
    body: CreateCustomerBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    svc = LoyaltyService(session)
    try:
        birthday = date.fromisoformat(body.birthday) if body.birthday else None
        customer = await svc.create_customer(
            seller_id,
            body.phone,
            body.first_name,
            body.last_name,
            birthday=birthday,
        )
        await session.commit()
        return customer
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный формат даты рождения")
    except (DuplicatePhoneError, LoyaltyServiceError) as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/customers/export")
async def export_customers_csv(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Export customers to CSV file."""
    svc = LoyaltyService(session)
    customers = await svc.list_customers(seller_id)

    # Create CSV in memory
    output = io.StringIO()
    # BOM for Excel UTF-8 compatibility
    output.write('\ufeff')
    writer = csv.writer(output, delimiter=';')

    # Headers
    writer.writerow(['Телефон', 'Имя', 'Фамилия', 'Карта', 'Баллы', 'Дата регистрации', 'Заметка', 'Теги'])

    # Rows
    for c in customers:
        writer.writerow([
            c.get('phone', ''),
            c.get('first_name', ''),
            c.get('last_name', ''),
            c.get('card_number', ''),
            c.get('points_balance', 0),
            c.get('created_at', ''),
            c.get('notes', ''),
            ', '.join(c.get('tags') or []) if isinstance(c.get('tags'), list) else (c.get('tags') or ''),
        ])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),
        media_type='text/csv; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename="customers_{datetime.now().strftime("%Y%m%d")}.csv"'}
    )


@router.get("/customers/all")
async def list_all_customers(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Unified list: all subscribers + standalone loyalty customers.
    Used by the Customers page to show the full client base with search support.
    """
    from backend.app.services.cart import FavoriteSellersService
    svc = FavoriteSellersService(session)
    return await svc.get_subscribers_with_customers(seller_id)


@router.get("/customers/{customer_id}")
async def get_customer(
    customer_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    svc = LoyaltyService(session)
    data = await svc.get_customer(customer_id, seller_id)
    if not data:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    order_svc = OrderService(session)
    orders = await order_svc.get_seller_orders_by_buyer_phone(seller_id, data.get("phone") or "")
    completed = [o for o in orders if o.get("status") in ("done", "completed")]
    total_purchases = sum(float(o.get("total_price") or 0) for o in completed)
    last_order_at = None
    if completed:
        dates = [o.get("created_at") for o in completed if o.get("created_at")]
        if dates:
            last_order_at = max(dates)
    data["total_purchases"] = round(total_purchases, 2)
    data["last_order_at"] = last_order_at
    data["completed_orders_count"] = len(completed)
    # Compute loyalty tier
    from backend.app.services.loyalty import compute_tier
    from backend.app.models.seller import Seller
    seller = await session.get(Seller, seller_id)
    tiers_config = getattr(seller, 'loyalty_tiers_config', None) if seller else None
    data["tier"] = compute_tier(total_purchases, tiers_config)
    return data


@router.get("/customers/{customer_id}/orders")
async def get_customer_orders(
    customer_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    svc = LoyaltyService(session)
    customer = await svc.get_customer(customer_id, seller_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    order_svc = OrderService(session)
    return await order_svc.get_seller_orders_by_buyer_phone(seller_id, customer.get("phone") or "")


@router.patch("/customers/{customer_id}")
async def update_customer(
    customer_id: int,
    body: UpdateCustomerBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    svc = LoyaltyService(session)
    result = await svc.update_customer(
        seller_id, customer_id,
        notes=body.notes, tags=body.tags, birthday=body.birthday,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    await session.commit()
    return result


@router.post("/customers/{customer_id}/sales")
async def record_customer_sale(
    customer_id: int,
    body: RecordSaleBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма должна быть больше 0")
    svc = LoyaltyService(session)
    try:
        result = await svc.accrue_points(seller_id, customer_id, body.amount, order_id=None)
        await session.commit()
        return result
    except CustomerNotFoundError as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/customers/{customer_id}/deduct")
async def deduct_customer_points(
    customer_id: int,
    body: DeductPointsBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    from fastapi import HTTPException
    if body.points <= 0:
        raise HTTPException(status_code=400, detail="Укажите положительное количество баллов")
    svc = LoyaltyService(session)
    try:
        result = await svc.deduct_points(seller_id, customer_id, body.points)
        await session.commit()
        return result
    except (CustomerNotFoundError, LoyaltyServiceError) as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)


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
    from backend.app.core.password_validation import validate_password_strength
    
    # Validate new password strength
    is_valid, errors = validate_password_strength(body.new_password)
    if not is_valid:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="; ".join(errors))
    
    # Validate login length
    if len(body.new_login) < 3:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Логин должен содержать минимум 3 символа")
    
    if len(body.new_login) > 64:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Логин слишком длинный (максимум 64 символа)")
    
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


# --- SUBSCRIBERS ---
@router.get("/subscribers")
async def get_subscribers(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Get all subscribers for the current seller with loyalty status."""
    from backend.app.services.cart import FavoriteSellersService
    svc = FavoriteSellersService(session)
    subscribers = await svc.get_subscribers(seller_id)
    count = await svc.get_subscriber_count(seller_id)
    return {"subscribers": subscribers, "total": count}


@router.get("/subscribers/count")
async def get_subscriber_count(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Get subscriber count for the current seller."""
    from backend.app.services.cart import FavoriteSellersService
    svc = FavoriteSellersService(session)
    count = await svc.get_subscriber_count(seller_id)
    return {"count": count}


# --- CUSTOMER EVENTS ---
class CreateEventBody(BaseModel):
    title: str
    event_date: str
    remind_days_before: int = 3
    notes: Optional[str] = None


class UpdateEventBody(BaseModel):
    title: Optional[str] = None
    event_date: Optional[str] = None
    remind_days_before: Optional[int] = None
    notes: Optional[str] = "__unset__"


@router.post("/customers/{customer_id}/events")
async def create_customer_event(
    customer_id: int,
    body: CreateEventBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    svc = LoyaltyService(session)
    try:
        event_date = date.fromisoformat(body.event_date)
        result = await svc.add_event(
            seller_id, customer_id,
            title=body.title,
            event_date=event_date,
            remind_days_before=body.remind_days_before,
            notes=body.notes,
        )
        await session.commit()
        return result
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный формат даты")
    except CustomerNotFoundError as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/customers/{customer_id}/events/{event_id}")
async def update_customer_event(
    customer_id: int,
    event_id: int,
    body: UpdateEventBody,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    svc = LoyaltyService(session)
    try:
        event_date = date.fromisoformat(body.event_date) if body.event_date else None
        result = await svc.update_event(
            seller_id, event_id,
            title=body.title,
            event_date=event_date,
            remind_days_before=body.remind_days_before,
            notes=body.notes,
        )
        if not result:
            raise HTTPException(status_code=404, detail="Событие не найдено")
        await session.commit()
        return result
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный формат даты")


@router.delete("/customers/{customer_id}/events/{event_id}")
async def delete_customer_event(
    customer_id: int,
    event_id: int,
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    svc = LoyaltyService(session)
    ok = await svc.delete_event(seller_id, event_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    await session.commit()
    return {"ok": True}


@router.get("/dashboard/upcoming-events")
async def get_upcoming_events(
    days: int = Query(default=7, ge=1, le=90),
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    svc = LoyaltyService(session)
    return await svc.get_upcoming_events(seller_id, days_ahead=days)


# --- GLOBAL INVENTORY ---
@router.get("/inventory/all")
async def get_global_inventory(
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """All flowers with remaining stock from open receptions, grouped by flower."""
    return await get_all_items_for_inventory(session, seller_id)


@router.post("/inventory/all/check")
async def check_global_inventory(
    lines: List[dict],
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Preview differences between system and actual quantities per flower."""
    return await global_inventory_check(session, seller_id, lines)


@router.post("/inventory/all/apply")
async def apply_global_inventory(
    lines: List[dict],
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Apply actual quantities per flower across all open receptions."""
    result = await global_inventory_apply(session, seller_id, lines)
    await session.commit()
    # Sync bouquet product quantities after global inventory adjustment
    try:
        from backend.app.services.bouquets import sync_bouquet_product_quantities
        await sync_bouquet_product_quantities(session, seller_id)
        await session.commit()
    except Exception:
        logger.exception("sync_bouquet_product_quantities failed after global_inventory_apply")
    return result
