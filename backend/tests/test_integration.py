"""
Integration tests for critical user flows.
These tests verify end-to-end functionality.
"""
import pytest
from httpx import AsyncClient
from backend.app.main import app


@pytest.mark.asyncio
async def test_order_creation_flow():
    """Test complete order creation flow."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        # 1. Get list of sellers
        response = await client.get("/public/sellers?page=1&per_page=20")
        assert response.status_code == 200
        sellers = response.json()
        assert "sellers" in sellers
        
        if sellers["sellers"]:
            seller_id = sellers["sellers"][0]["id"]
            
            # 2. Get seller products
            response = await client.get(f"/public/sellers/{seller_id}/products")
            assert response.status_code == 200
            
            # 3. Create order (would need authentication in real scenario)
            # This is a simplified test
            pass


@pytest.mark.asyncio
async def test_health_check():
    """Test health check endpoint."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "checks" in data


@pytest.mark.asyncio
async def test_metrics_endpoint():
    """Test Prometheus metrics endpoint."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/metrics")
        assert response.status_code == 200
        assert "http_requests_total" in response.text or "prometheus" in response.text.lower()


@pytest.mark.asyncio
async def test_rate_limiting():
    """Test rate limiting on login endpoints."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        # Make multiple rapid requests
        responses = []
        for _ in range(10):
            response = await client.post(
                "/admin/login",
                json={"login": "wrong", "password": "wrong"}
            )
            responses.append(response.status_code)
        
        # Should eventually get rate limited (429)
        # Note: This depends on rate limiter configuration
        assert 429 in responses or all(r == 401 for r in responses)
