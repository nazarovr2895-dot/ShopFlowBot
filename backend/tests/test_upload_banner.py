"""
Интеграционные тесты загрузки баннера магазина (POST /seller-web/upload-banner).

Запуск (из корня репозитория, с окружением backend):
  docker compose run --rm backend python -m pytest tests/test_upload_banner.py -v
или из backend с установленными зависимостями:
  cd backend && pytest tests/test_upload_banner.py -v
"""
import io
import pytest
from PIL import Image
from httpx import AsyncClient
from sqlalchemy import select

from backend.app.main import app
from backend.app.api.seller_auth import require_seller_token
from backend.app.models.seller import Seller
from backend.app.api.seller_web import UPLOAD_DIR, SHOP_BANNERS_UPLOAD_SUBDIR
from backend.tests.conftest import TestSessionLocal


def _make_png_bytes(width: int = 200, height: int = 100) -> bytes:
    """Минимальное валидное PNG для теста."""
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color=(100, 150, 200))
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_upload_banner_success(
    client: AsyncClient,
    test_seller: Seller,
    tmp_path,
    monkeypatch,
):
    """Успешная загрузка баннера: 200, в ответе banner_url, в БД обновлён seller.banner_url."""
    monkeypatch.setattr(
        "backend.app.api.seller_web.UPLOAD_DIR",
        tmp_path,
    )
    async def override_seller_token():
        return test_seller.seller_id

    app.dependency_overrides[require_seller_token] = override_seller_token
    try:
        png = _make_png_bytes()
        response = await client.post(
            "/seller-web/upload-banner",
            files={"file": ("banner.png", png, "image/png")},
        )
        assert response.status_code == 200
        data = response.json()
        assert "banner_url" in data
        assert data["banner_url"].startswith("/static/")
        assert "shop_banners" in data["banner_url"]
        assert str(test_seller.seller_id) in data["banner_url"]
        assert data["banner_url"].endswith(".webp")

        # Проверяем, что в БД у продавца записался banner_url
        async with TestSessionLocal() as session:
            result = await session.execute(
                select(Seller).where(Seller.seller_id == test_seller.seller_id)
            )
            seller = result.scalar_one_or_none()
            assert seller is not None
            assert seller.banner_url == data["banner_url"]

        # Файл должен быть на диске (в tmp_path)
        expected_path = (
            tmp_path / SHOP_BANNERS_UPLOAD_SUBDIR / f"{test_seller.seller_id}.webp"
        )
        assert expected_path.exists()
        assert expected_path.read_bytes()[:4] == b"RIFF"
    finally:
        app.dependency_overrides.pop(require_seller_token, None)


@pytest.mark.asyncio
async def test_upload_banner_unauthorized(client: AsyncClient):
    """Без X-Seller-Token возвращается 401."""
    png = _make_png_bytes()
    response = await client.post(
        "/seller-web/upload-banner",
        files={"file": ("banner.png", png, "image/png")},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_upload_banner_invalid_file(
    client: AsyncClient,
    test_seller: Seller,
    tmp_path,
    monkeypatch,
):
    """Передача не-изображения возвращает 400."""
    monkeypatch.setattr(
        "backend.app.api.seller_web.UPLOAD_DIR",
        tmp_path,
    )
    async def override_seller_token():
        return test_seller.seller_id

    app.dependency_overrides[require_seller_token] = override_seller_token
    try:
        response = await client.post(
            "/seller-web/upload-banner",
            files={"file": ("fake.txt", b"not an image", "text/plain")},
        )
        assert response.status_code == 400
    finally:
        app.dependency_overrides.pop(require_seller_token, None)
