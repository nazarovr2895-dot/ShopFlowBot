"""Download file from Telegram Bot API and save to static. Used when seller sends photo in bot."""
import os
import uuid
import logging
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN")
TELEGRAM_FILE_API = "https://api.telegram.org/file/bot{BOT_TOKEN}/{file_path}"

# Same as seller_web
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "static"
PRODUCTS_UPLOAD_SUBDIR = Path("uploads") / "products"
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


async def download_telegram_photo_to_static(file_id: str) -> str | None:
    """
    Get file from Telegram by file_id, save to static/uploads/products/, return path like /static/uploads/products/xxx.jpg.
    Returns None if BOT_TOKEN missing or Telegram API error.
    """
    if not BOT_TOKEN:
        logger.warning("BOT_TOKEN not set, cannot download Telegram file")
        return None
    async with httpx.AsyncClient(timeout=30.0) as client:
        # getFile
        r = await client.get(
            f"https://api.telegram.org/bot{BOT_TOKEN}/getFile",
            params={"file_id": file_id},
        )
        if r.status_code != 200:
            logger.warning("Telegram getFile failed: %s %s", r.status_code, r.text)
            return None
        data = r.json()
        if not data.get("ok"):
            logger.warning("Telegram getFile not ok: %s", data)
            return None
        file_path = data.get("result", {}).get("file_path")
        if not file_path:
            return None
        # download file
        url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_path}"
        r2 = await client.get(url)
        if r2.status_code != 200:
            logger.warning("Telegram file download failed: %s", r2.status_code)
            return None
        content = r2.content
        if len(content) > 10 * 1024 * 1024:  # 10 MB
            logger.warning("Telegram file too large: %s bytes", len(content))
            return None
        # guess extension from path or content
        ext = Path(file_path).suffix.lower()
        if ext not in ALLOWED_IMAGE_EXTENSIONS:
            ext = ".jpg"
        upload_dir = UPLOAD_DIR / PRODUCTS_UPLOAD_SUBDIR
        upload_dir.mkdir(parents=True, exist_ok=True)
        name = f"{uuid.uuid4().hex}{ext}"
        path = upload_dir / name
        path.write_bytes(content)
        return f"/static/{PRODUCTS_UPLOAD_SUBDIR}/{name}"
