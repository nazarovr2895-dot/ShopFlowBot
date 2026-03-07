"""Upload endpoints: product photo, shop banner, shop logo, about-media."""
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.services.sellers import SellerService

from ._common import (
    logger,
    UPLOAD_DIR,
    PRODUCTS_UPLOAD_SUBDIR,
    SHOP_BANNERS_UPLOAD_SUBDIR,
    SHOP_LOGOS_UPLOAD_SUBDIR,
    ABOUT_MEDIA_UPLOAD_SUBDIR,
    ALLOWED_IMAGE_EXTENSIONS,
    UPLOAD_MAX_SIDE_PX,
    UPLOAD_BANNER_MAX_SIDE_PX,
    UPLOAD_LOGO_MAX_SIDE_PX,
    UPLOAD_OUTPUT_QUALITY,
    UPLOAD_OUTPUT_EXT,
    require_seller_token,
    get_session,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_image_content(content: bytes) -> bool:
    """Validate that content is actually an image (delegate to core)."""
    from backend.app.core.image_convert import validate_image_content
    return validate_image_content(content)


def _convert_image_to_webp(content: bytes, max_side_px: int, force_square: bool = False) -> bytes:
    """Общий конвертер (делегирует в core); при ошибке — HTTPException 400."""
    from backend.app.core.image_convert import convert_image_to_webp
    try:
        return convert_image_to_webp(content, max_side_px, quality=UPLOAD_OUTPUT_QUALITY, force_square=force_square)
    except ValueError as e:
        logger.warning("Image conversion failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e)) from e


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

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
    content = _convert_image_to_webp(content, UPLOAD_MAX_SIDE_PX, force_square=True)

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
    banner_url = f"/static/{SHOP_BANNERS_UPLOAD_SUBDIR}/{name}?v={int(time.time())}"
    service = SellerService(session)
    await service.update_field(seller_id, "banner_url", banner_url)
    return {"banner_url": banner_url}


@router.post("/upload-logo")
async def upload_shop_logo(
    file: UploadFile = File(...),
    seller_id: int = Depends(require_seller_token),
    session: AsyncSession = Depends(get_session),
):
    """Upload shop logo (square icon). One per seller, overwrites previous. Returns logo_url."""
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
    content = _convert_image_to_webp(content, UPLOAD_LOGO_MAX_SIDE_PX, force_square=True)
    upload_dir = UPLOAD_DIR / SHOP_LOGOS_UPLOAD_SUBDIR
    upload_dir.mkdir(parents=True, exist_ok=True)
    name = f"{seller_id}{UPLOAD_OUTPUT_EXT}"
    path = upload_dir / name
    try:
        path.resolve().relative_to(upload_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Недопустимый путь к файлу")
    path.write_bytes(content)
    logo_url = f"/static/{SHOP_LOGOS_UPLOAD_SUBDIR}/{name}?v={int(time.time())}"
    service = SellerService(session)
    await service.update_field(seller_id, "logo_url", logo_url)
    return {"logo_url": logo_url}


@router.post("/upload-about-media")
async def upload_about_media(
    file: UploadFile = File(...),
    seller_id: int = Depends(require_seller_token),
):
    """Upload image for About Us page. Returns url path."""
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
    content = _convert_image_to_webp(content, UPLOAD_MAX_SIDE_PX)
    upload_dir = UPLOAD_DIR / ABOUT_MEDIA_UPLOAD_SUBDIR / str(seller_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{UPLOAD_OUTPUT_EXT}"
    path = upload_dir / name
    try:
        path.resolve().relative_to(upload_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Недопустимый путь к файлу")
    path.write_bytes(content)
    url = f"/static/{ABOUT_MEDIA_UPLOAD_SUBDIR}/{seller_id}/{name}"
    return {"url": url}
