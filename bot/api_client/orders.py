import logging
from bot.api_client.base import make_request
from bot.api_client.models import OrderObj

logger = logging.getLogger(__name__)


async def api_create_order(order_data: dict):
    """
    Создание заказа.
    Возвращает объект заказа или None, если лимит исчерпан.
    """
    response = await make_request("POST", "/orders/create", data=order_data)

    if not response or "id" not in response:
        logger.error("Failed to create order. API response: %s", response)
        return None

    return OrderObj(response)


# --- Методы управления статусами ---

async def api_accept_order(order_id: int):
    return await make_request("POST", f"/orders/{order_id}/accept")

async def api_reject_order(order_id: int):
    return await make_request("POST", f"/orders/{order_id}/reject")

async def api_done_order(order_id: int):
    return await make_request("POST", f"/orders/{order_id}/done")

async def api_update_order_status(order_id: int, status: str):
    """Изменить статус заказа"""
    return await make_request("PUT", f"/orders/{order_id}/status", params={"status": status})
