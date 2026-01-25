from bot.api_client.base import make_request

async def api_get_agent_stats(agent_id: int):
    """
    Получает баланс и количество рефералов агента.
    """
    # Запрос к нашему новому эндпоинту GET /agents/{id}/stats
    return await make_request("GET", f"/agents/{agent_id}/stats")
# ... (старый код с api_get_agent_stats оставь) ...

async def api_register_agent_data(tg_id: int, fio: str, phone: str, age: int, is_self_employed: bool):
    """Отправляет анкету на сервер для смены роли"""
    payload = {
        "tg_id": tg_id,
        "fio": fio,
        "phone": phone,
        "age": age,
        "is_self_employed": is_self_employed
    }
    # Мы используем buyers/upgrade_to_agent, так как технически это апдейт юзера
    return await make_request("POST", "/buyers/upgrade_to_agent", data=payload)