"""
Конвертация загружаемых изображений в WebP (фото товаров, баннер магазина).
Минимальные зависимости: Pillow. Используется из backend.app.api.seller_web.
"""
import io
from PIL import Image, ImageOps

DEFAULT_QUALITY = 85


def validate_image_content(content: bytes) -> bool:
    """Проверка по magic bytes, что содержимое — изображение (JPEG/PNG/WebP/GIF)."""
    if content.startswith(b'\xff\xd8\xff'):
        return True
    if content.startswith(b'\x89PNG\r\n\x1a\n'):
        return True
    if content.startswith(b'RIFF') and b'WEBP' in content[:12]:
        return True
    if content.startswith(b'GIF87a') or content.startswith(b'GIF89a'):
        return True
    return False


def convert_image_to_webp(
    content: bytes,
    max_side_px: int,
    quality: int = DEFAULT_QUALITY,
) -> bytes:
    """
    Конвертирует изображение в WebP: валидация, EXIF-поворот, ресайз по длинной стороне.
    Используется для фото товара и баннера магазина.
    :raises ValueError: если контент не изображение или не удалось обработать.
    """
    if not validate_image_content(content):
        raise ValueError("Файл не является изображением")
    try:
        img = Image.open(io.BytesIO(content))
        img.verify()
        img = Image.open(io.BytesIO(content))
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        w, h = img.size
        if max(w, h) > max_side_px:
            ratio = max_side_px / max(w, h)
            new_size = (int(w * ratio), int(h * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, "WEBP", quality=quality)
        return out.getvalue()
    except Exception as e:
        raise ValueError("Не удалось обработать изображение") from e
