from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.api import buyers, sellers, orders, agents, admin, public

app = FastAPI(title="FlowShop Backend")

# CORS middleware для Mini App
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",  # В продакшене заменить на конкретные домены
        # "https://your-miniapp-domain.com",
        # "https://telegram.org",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Подключаем роутеры (части нашего приложения)
app.include_router(public.router, prefix="/public", tags=["public"])  # Публичный API для Mini App
app.include_router(buyers.router, prefix="/buyers", tags=["buyers"])
app.include_router(sellers.router, prefix="/sellers", tags=["sellers"])
app.include_router(orders.router, prefix="/orders", tags=["orders"])
app.include_router(agents.router, prefix="/agents", tags=["agents"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])

@app.get("/")
async def root():
    return {"status": "ok"}