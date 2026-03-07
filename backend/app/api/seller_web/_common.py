"""Shared constants, helpers, and dependencies for seller_web sub-modules."""
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_session  # noqa: F401 — re-export
from backend.app.api.seller_auth import (  # noqa: F401 — re-export
    require_seller_token,
    require_seller_token_with_owner,
    BranchInfo,
)
from backend.app.core.logging import get_logger
from backend.app.models.seller import Seller

logger = get_logger(__name__)

# Upload directories
UPLOAD_DIR = Path(__file__).resolve().parents[3] / "static"
PRODUCTS_UPLOAD_SUBDIR = Path("uploads") / "products"
SHOP_BANNERS_UPLOAD_SUBDIR = Path("uploads") / "shop_banners"
SHOP_LOGOS_UPLOAD_SUBDIR = Path("uploads") / "shop_logos"
ABOUT_MEDIA_UPLOAD_SUBDIR = Path("uploads") / "about"
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

# Image conversion settings
UPLOAD_MAX_SIDE_PX = 1200
UPLOAD_BANNER_MAX_SIDE_PX = 1920
UPLOAD_LOGO_MAX_SIDE_PX = 512
UPLOAD_OUTPUT_QUALITY = 85
UPLOAD_OUTPUT_EXT = ".webp"


async def resolve_branch_target(
    branch: Optional[str],
    seller_id: int,
    owner_id: int,
    session: AsyncSession,
):
    """Resolve branch query param to seller_id or list of seller_ids.

    - branch='all' -> list of all seller_ids for this owner
    - branch='<id>' -> specific branch (verified belongs to owner)
    - branch=None  -> current seller_id from token
    """
    if branch == "all":
        if seller_id != owner_id:
            return seller_id  # branch employee: own data only
        result = await session.execute(
            select(Seller.seller_id).where(
                Seller.owner_id == owner_id,
                Seller.deleted_at.is_(None),
            )
        )
        ids = [r[0] for r in result.all()]
        return ids if len(ids) > 1 else (ids[0] if ids else seller_id)
    elif branch:
        try:
            target_id = int(branch)
        except ValueError:
            return seller_id
        result = await session.execute(
            select(Seller.seller_id).where(
                Seller.seller_id == target_id,
                Seller.owner_id == owner_id,
                Seller.deleted_at.is_(None),
            )
        )
        if result.scalar_one_or_none():
            return target_id
        return seller_id
    return seller_id
