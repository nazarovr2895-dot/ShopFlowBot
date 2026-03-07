"""Admin order listing & detail endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_session
from backend.app.api.admin._common import require_admin_token

router = APIRouter()


# ============================================
# ЗАКАЗЫ (полный список с фильтрами)
# ============================================

@router.get("/orders")
async def get_admin_orders(
    status: Optional[str] = None,
    seller_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    delivery_type: Optional[str] = None,
    is_preorder: Optional[bool] = None,
    search: Optional[str] = None,
    page: int = 1,
    per_page: int = 50,
    session: AsyncSession = Depends(get_session),
    _token: None = Depends(require_admin_token),
):
    """Список всех заказов платформы с фильтрами и пагинацией."""
    from datetime import datetime as dt, time as time_t
    from sqlalchemy import select, func, and_, or_
    from backend.app.models.order import Order
    from backend.app.models.seller import Seller
    from backend.app.models.user import User

    filters = []
    if status:
        filters.append(Order.status == status)
    if seller_id:
        filters.append(Order.seller_id == seller_id)
    if date_from:
        filters.append(Order.created_at >= dt.combine(dt.fromisoformat(date_from[:10]).date(), time_t.min))
    if date_to:
        filters.append(Order.created_at <= dt.combine(dt.fromisoformat(date_to[:10]).date(), time_t.max))
    if delivery_type:
        filters.append(Order.delivery_type == delivery_type)
    if is_preorder is not None:
        filters.append(Order.is_preorder == is_preorder)
    if search:
        search = search.strip()
        try:
            order_id = int(search)
            filters.append(Order.id == order_id)
        except ValueError:
            pattern = f"%{search}%"
            filters.append(or_(
                User.fio.ilike(pattern),
                User.phone.ilike(pattern),
                Order.guest_name.ilike(pattern),
                Order.guest_phone.ilike(pattern),
            ))

    where = and_(*filters) if filters else True

    # counts by status
    q_counts = select(Order.status, func.count(Order.id)).where(where).group_by(Order.status)
    count_rows = (await session.execute(q_counts)).all()
    status_breakdown = {r[0]: r[1] for r in count_rows}
    total = sum(status_breakdown.values())

    # total amount (all matching filters — informational)
    q_sum = select(func.coalesce(func.sum(Order.total_price), 0)).where(where)
    total_amount = float((await session.execute(q_sum)).scalar() or 0)

    # completed amount (actual revenue — only done/completed orders within filters)
    completed_filters = list(filters) + [Order.status.in_(["done", "completed"])]
    q_completed_sum = select(func.coalesce(func.sum(Order.total_price), 0)).where(and_(*completed_filters))
    completed_amount = float((await session.execute(q_completed_sum)).scalar() or 0)

    # paginated orders
    offset = (page - 1) * per_page
    q_orders = (
        select(
            Order.id,
            Order.buyer_id,
            Order.seller_id,
            Order.items_info,
            Order.total_price,
            Order.original_price,
            Order.points_discount,
            Order.status,
            Order.delivery_type,
            Order.address,
            Order.comment,
            Order.created_at,
            Order.completed_at,
            Order.is_preorder,
            Order.preorder_delivery_date,
            Seller.shop_name.label("seller_name"),
            User.fio.label("buyer_fio"),
            User.phone.label("buyer_phone"),
            Order.guest_name,
            Order.guest_phone,
        )
        .outerjoin(Seller, Seller.seller_id == Order.seller_id)
        .outerjoin(User, User.tg_id == Order.buyer_id)
        .where(where)
        .order_by(Order.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    rows = (await session.execute(q_orders)).all()

    orders = []
    for r in rows:
        orders.append({
            "id": r.id,
            "buyer_id": r.buyer_id,
            "seller_id": r.seller_id,
            "items_info": r.items_info,
            "total_price": round(float(r.total_price or 0)),
            "original_price": round(float(r.original_price)) if r.original_price else None,
            "points_discount": round(float(r.points_discount or 0)),
            "status": r.status,
            "delivery_type": r.delivery_type,
            "address": r.address,
            "comment": r.comment,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "is_preorder": r.is_preorder or False,
            "preorder_delivery_date": str(r.preorder_delivery_date) if r.preorder_delivery_date else None,
            "seller_name": r.seller_name or "",
            "seller_tg_id": r.seller_id,
            "buyer_fio": r.guest_name or r.buyer_fio or "",
            "buyer_phone": r.guest_phone or r.buyer_phone or "",
        })

    # sellers list for filter dropdown
    q_sellers = select(Seller.seller_id, Seller.shop_name).where(Seller.deleted_at.is_(None)).order_by(Seller.shop_name)
    seller_rows = (await session.execute(q_sellers)).all()
    sellers_list = [{"id": r[0], "name": r[1] or f"#{r[0]}"} for r in seller_rows]

    pages = max(1, -(-total // per_page))  # ceil division

    return {
        "orders": orders,
        "total": total,
        "pages": pages,
        "page": page,
        "status_breakdown": status_breakdown,
        "total_amount": round(total_amount),
        "completed_amount": round(completed_amount),
        "sellers_list": sellers_list,
    }


@router.get("/orders/{order_id}")
async def get_admin_order_detail(
    order_id: int,
    session: AsyncSession = Depends(get_session),
    _token: None = Depends(require_admin_token),
):
    """Детальная информация о заказе с товарами и фото."""
    from sqlalchemy import select
    from backend.app.models.order import Order
    from backend.app.models.seller import Seller
    from backend.app.models.user import User
    from backend.app.models.product import Product
    from backend.app.core.item_parsing import parse_items_info

    q = (
        select(Order, Seller.shop_name.label("seller_name"), User.fio.label("buyer_fio"), User.phone.label("buyer_phone"))
        .outerjoin(Seller, Seller.seller_id == Order.seller_id)
        .outerjoin(User, User.tg_id == Order.buyer_id)
        .where(Order.id == order_id)
    )
    row = (await session.execute(q)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")

    order = row[0]
    seller_name = row.seller_name
    buyer_fio = row.buyer_fio
    buyer_phone = row.buyer_phone

    # Parse items and fetch product photos
    parsed = parse_items_info(order.items_info)
    product_ids = [item["product_id"] for item in parsed]
    products_map = {}
    if product_ids:
        q_products = select(Product.id, Product.photo_id, Product.photo_ids).where(Product.id.in_(product_ids))
        product_rows = (await session.execute(q_products)).all()
        for p in product_rows:
            photo = None
            if p.photo_ids and len(p.photo_ids) > 0:
                photo = p.photo_ids[0]
            elif p.photo_id:
                photo = p.photo_id
            products_map[p.id] = photo

    items = []
    for item in parsed:
        items.append({
            "product_id": item["product_id"],
            "name": item["name"],
            "price": float(item.get("price", 0)),
            "quantity": item["quantity"],
            "photo": products_map.get(item["product_id"]),
        })

    return {
        "id": order.id,
        "buyer_id": order.buyer_id,
        "seller_id": order.seller_id,
        "seller_tg_id": order.seller_id,
        "items_info": order.items_info,
        "total_price": round(float(order.total_price or 0)),
        "original_price": round(float(order.original_price)) if order.original_price else None,
        "points_discount": round(float(order.points_discount or 0)),
        "status": order.status,
        "delivery_type": order.delivery_type,
        "address": order.address,
        "comment": order.comment,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "completed_at": order.completed_at.isoformat() if order.completed_at else None,
        "is_preorder": order.is_preorder or False,
        "preorder_delivery_date": str(order.preorder_delivery_date) if order.preorder_delivery_date else None,
        "seller_name": seller_name or "",
        "buyer_fio": order.guest_name or buyer_fio or "",
        "buyer_phone": order.guest_phone or buyer_phone or "",
        "delivery_fee": float(order.delivery_fee) if order.delivery_fee else None,
        "payment_method": order.payment_method,
        "payment_status": order.payment_status,
        "delivery_slot_date": str(order.delivery_slot_date) if order.delivery_slot_date else None,
        "delivery_slot_start": order.delivery_slot_start,
        "delivery_slot_end": order.delivery_slot_end,
        "recipient_name": order.recipient_name,
        "recipient_phone": order.recipient_phone,
        "gift_note": order.gift_note,
        "items": items,
    }
