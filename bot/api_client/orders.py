from bot.api_client.base import make_request

async def api_create_order(order_data: dict):
    """
    Создание заказа.
    Возвращает объект заказа или None, если лимит исчерпан.
    """
    response = await make_request("POST", "/orders/create", data=order_data)
    
    # Если сервер вернул ошибку (например, 409 Conflict - лимит), response будет содержать "status" или быть None
    if not response or "id" not in response:
        # Можно добавить логику проверки типа ошибки, но пока просто вернем None
        print(f"❌ Не удалось создать заказ. Ответ API: {response}")
        return None

    class OrderObj:
        id = response.get("id")
        status = response.get("status")
        
    return OrderObj()

# --- Новые методы управления статусами ---

async def api_accept_order(order_id: int):
    return await make_request("POST", f"/orders/{order_id}/accept")

async def api_reject_order(order_id: int):
    return await make_request("POST", f"/orders/{order_id}/reject")

async def api_done_order(order_id: int):
    return await make_request("POST", f"/orders/{order_id}/done")

async def api_update_order_status(order_id: int, status: str):
    """Изменить статус заказа"""
    return await make_request("PUT", f"/orders/{order_id}/status", params={"status": status})