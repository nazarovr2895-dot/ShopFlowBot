from fastapi import FastAPI
from backend.app.api import buyers, sellers, orders, agents, admin

app = FastAPI(title="FlowShop Backend")

# Подключаем роутеры (части нашего приложения)
app.include_router(buyers.router, prefix="/buyers", tags=["buyers"])
app.include_router(sellers.router, prefix="/sellers", tags=["sellers"])
app.include_router(orders.router, prefix="/orders", tags=["orders"])
app.include_router(agents.router, prefix="/agents", tags=["agents"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])