"""
Tests for image conversion (core.image_convert).

Проверяет конвертер изображений в WebP — тот же, что используется при загрузке
фото товара и баннера магазина (seller_web вызывает backend.app.core.image_convert).
"""
import io
import pytest
from PIL import Image

from backend.app.core.image_convert import (
    validate_image_content,
    convert_image_to_webp,
    crop_to_square,
)


# --- validate_image_content ---


def test_validate_image_content_jpeg():
    """JPEG magic bytes are recognized."""
    jpeg_magic = b'\xff\xd8\xff' + b'\x00' * 10
    assert validate_image_content(jpeg_magic) is True


def test_validate_image_content_png():
    """PNG magic bytes are recognized."""
    png_magic = b'\x89PNG\r\n\x1a\n' + b'\x00' * 10
    assert validate_image_content(png_magic) is True


def test_validate_image_content_webp():
    """WebP magic bytes are recognized."""
    webp_magic = b'RIFF' + b'\x00' * 4 + b'WEBP'
    assert validate_image_content(webp_magic) is True


def test_validate_image_content_gif():
    """GIF87a and GIF89a are recognized."""
    assert validate_image_content(b'GIF87a' + b'\x00' * 10) is True
    assert validate_image_content(b'GIF89a' + b'\x00' * 10) is True


def test_validate_image_content_invalid():
    """Non-image bytes are rejected."""
    assert validate_image_content(b'') is False
    assert validate_image_content(b'not an image') is False
    assert validate_image_content(b'\x00\x01\x02\x03') is False


# --- convert_image_to_webp ---


def _png_bytes(width: int, height: int) -> bytes:
    """Create minimal valid PNG bytes (e.g. for heavy PNG test)."""
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color=(128, 128, 128))
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_convert_image_to_webp_output_format():
    """Конвертер возвращает WebP (magic bytes)."""
    png = _png_bytes(100, 100)
    out = convert_image_to_webp(png, max_side_px=1200)
    assert out.startswith(b'RIFF')
    assert b'WEBP' in out[:12]


def test_convert_image_to_webp_resize_large_image():
    """Большое изображение уменьшается по длинной стороне до max_side_px."""
    # 2000 x 1000 -> при max_side_px=1200 должно стать 1200 x 600
    png = _png_bytes(2000, 1000)
    out = convert_image_to_webp(png, max_side_px=1200)
    img = Image.open(io.BytesIO(out))
    assert img.size == (1200, 600)


def test_convert_image_to_webp_small_image_unchanged():
    """Маленькое изображение не увеличивается, только конвертируется в WebP."""
    png = _png_bytes(100, 50)
    out = convert_image_to_webp(png, max_side_px=1200)
    img = Image.open(io.BytesIO(out))
    assert img.size == (100, 50)
    assert out.startswith(b'RIFF')


def test_convert_image_to_webp_invalid_raises():
    """Неизображение вызывает ValueError."""
    with pytest.raises(ValueError) as exc_info:
        convert_image_to_webp(b'not an image at all', max_side_px=1200)
    assert "изображением" in str(exc_info.value)


def test_convert_image_to_webp_banner_max_side():
    """Для баннера используется больший max_side (1920) — размер сохраняется до 1920."""
    png = _png_bytes(2000, 800)
    out = convert_image_to_webp(png, max_side_px=1920)
    img = Image.open(io.BytesIO(out))
    assert img.size == (1920, 768)


# --- crop_to_square ---


def test_crop_to_square_landscape():
    """Landscape image is center-cropped to square."""
    img = Image.new("RGB", (200, 100), color=(128, 128, 128))
    result = crop_to_square(img)
    assert result.size == (100, 100)


def test_crop_to_square_portrait():
    """Portrait image is center-cropped to square."""
    img = Image.new("RGB", (100, 200), color=(128, 128, 128))
    result = crop_to_square(img)
    assert result.size == (100, 100)


def test_crop_to_square_already_square():
    """Square image is returned unchanged."""
    img = Image.new("RGB", (100, 100), color=(128, 128, 128))
    result = crop_to_square(img)
    assert result.size == (100, 100)


# --- convert_image_to_webp with force_square ---


def test_convert_image_to_webp_force_square():
    """With force_square=True, non-square image becomes square."""
    png = _png_bytes(200, 100)
    out = convert_image_to_webp(png, max_side_px=1200, force_square=True)
    img = Image.open(io.BytesIO(out))
    assert img.size == (100, 100)


def test_convert_image_to_webp_force_square_large():
    """Large non-square image is cropped to square then resized."""
    png = _png_bytes(2400, 1600)
    out = convert_image_to_webp(png, max_side_px=1200, force_square=True)
    img = Image.open(io.BytesIO(out))
    assert img.size == (1200, 1200)


def test_convert_image_to_webp_force_square_already_square():
    """Square image with force_square=True stays the same size."""
    png = _png_bytes(500, 500)
    out = convert_image_to_webp(png, max_side_px=1200, force_square=True)
    img = Image.open(io.BytesIO(out))
    assert img.size == (500, 500)
