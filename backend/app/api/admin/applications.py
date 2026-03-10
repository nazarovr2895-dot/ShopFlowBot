"""Заявки на подключение продавцов — CRUD для админ-панели."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_session
from backend.app.core.logging import get_logger
from backend.app.models.seller_application import SellerApplication

logger = get_logger(__name__)

router = APIRouter()


class ApplicationStatusUpdate(BaseModel):
    status: str  # approved / rejected


@router.get("/applications")
async def list_applications(
    status: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Список заявок на подключение. Фильтр по статусу."""
    q = select(SellerApplication).order_by(desc(SellerApplication.created_at))
    if status:
        q = q.where(SellerApplication.status == status)
    result = await session.execute(q)
    apps = result.scalars().all()
    return [
        {
            "id": a.id,
            "shop_name": a.shop_name,
            "inn": a.inn,
            "phone": a.phone,
            "org_name": a.org_name,
            "org_type": a.org_type,
            "ogrn": a.ogrn,
            "management_name": a.management_name,
            "org_address": a.org_address,
            "status": a.status,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "reviewed_at": a.reviewed_at.isoformat() if a.reviewed_at else None,
        }
        for a in apps
    ]


@router.put("/applications/{application_id}/status")
async def update_application_status(
    application_id: int,
    body: ApplicationStatusUpdate,
    session: AsyncSession = Depends(get_session),
):
    """Изменить статус заявки (approved / rejected)."""
    if body.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Статус должен быть 'approved' или 'rejected'")

    result = await session.execute(
        select(SellerApplication).where(SellerApplication.id == application_id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    app.status = body.status
    app.reviewed_at = datetime.utcnow()
    await session.commit()

    logger.info("Application status updated", id=application_id, status=body.status)
    return {"status": "ok"}
