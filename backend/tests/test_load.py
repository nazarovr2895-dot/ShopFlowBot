"""
Load testing examples using Locust.
Install: pip install locust

Run: locust -f tests/test_load.py --host=http://localhost:8000
"""
from locust import HttpUser, task, between
import random


class ShopFlowBotUser(HttpUser):
    """Simulate user behavior for load testing."""
    
    wait_time = between(1, 3)  # Wait 1-3 seconds between requests
    
    def on_start(self):
        """Called when a user starts."""
        # Register or login (if needed)
        pass
    
    @task(3)
    def get_public_sellers(self):
        """Get list of sellers (most common operation)."""
        self.client.get("/public/sellers?page=1&per_page=20")
    
    @task(2)
    def get_seller_detail(self):
        """Get seller details."""
        # Use a random seller ID (adjust based on your data)
        seller_id = random.randint(1, 100)
        self.client.get(f"/public/sellers/{seller_id}")
    
    @task(1)
    def get_products(self):
        """Get products for a seller."""
        seller_id = random.randint(1, 100)
        self.client.get(f"/public/sellers/{seller_id}/products")
    
    @task(1)
    def health_check(self):
        """Health check endpoint."""
        self.client.get("/health")


class AdminUser(HttpUser):
    """Simulate admin user behavior."""
    
    wait_time = between(2, 5)
    
    def on_start(self):
        """Login as admin."""
        # Login and store token
        response = self.client.post(
            "/admin/login",
            json={"login": "admin", "password": "password"}
        )
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.client.headers.update({"X-Admin-Token": self.token})
    
    @task(2)
    def list_sellers(self):
        """List all sellers."""
        self.client.get("/admin/sellers/all")
    
    @task(1)
    def get_stats(self):
        """Get seller statistics."""
        self.client.get("/admin/stats")


# Example: Run with 100 users, spawn rate 10/second
# locust -f tests/test_load.py --host=http://localhost:8000 --users 100 --spawn-rate 10
