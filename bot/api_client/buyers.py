from bot.api_client.base import make_request

class UserObj:
    def __init__(self, data: dict):
        self.id = data.get("id")
        self.tg_id = data.get("tg_id")
        self.username = data.get("username")
        self.fio = data.get("fio")
        self.balance = data.get("balance", 0)
        self.role = data.get("role", "BUYER")

async def api_get_user(tg_id: int):
    data = await make_request("GET", f"/buyers/{tg_id}")
    if data and isinstance(data, dict):
        return UserObj(data)
    return None

# 👇 ОБНОВЛЕННАЯ ФУНКЦИЯ: Добавили аргумент referrer_id
async def api_register_user(tg_id: int, username: str, fio: str = None, referrer_id: int = None):
    payload = {
        "tg_id": tg_id, 
        "username": username, 
        "fio": fio,
        "referrer_id": referrer_id # <--- Отправляем ID того, кто пригласил
    }
    data = await make_request("POST", "/buyers/register", data=payload)
    
    if data and isinstance(data, dict):
        return UserObj(data)
    return UserObj({"tg_id": tg_id, "role": "BUYER"})