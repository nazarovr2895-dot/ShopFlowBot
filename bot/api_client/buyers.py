from bot.api_client.base import make_request

# 👇 ТВОЙ ID (ЗОЛОТОЙ КЛЮЧ)
MASTER_ADMIN_ID = 8073613186

class UserObj:
    def __init__(self, data: dict):
        self.id = data.get("id")
        self.tg_id = data.get("tg_id")
        self.username = data.get("username")
        self.fio = data.get("fio")
        # Добавим баланс, раз уж он появился в базе
        self.balance = data.get("balance", 0)
        
        # Сохраняем реальную роль из базы данных
        self._db_role = data.get("role", "BUYER")
        
        # ЛОГИКА MASTER KEY:
        # Мастер-админ всегда имеет доступ к админке
        if self.tg_id == MASTER_ADMIN_ID:
            self.role = "ADMIN"
        else:
            self.role = self._db_role
    
    @property
    def is_agent(self) -> bool:
        """Проверяет, зарегистрирован ли пользователь как агент (по реальной роли в БД)"""
        return self._db_role == "AGENT"

async def api_get_user(tg_id: int):
    # Если это ты, можно даже не делать запрос, или делать, но подменять результат
    data = await make_request("GET", f"/buyers/{tg_id}")
    
    if data and isinstance(data, dict):
        return UserObj(data)
    
    # Если базы нет или ошибка — для тебя создаем "аварийного" админа
    if tg_id == MASTER_ADMIN_ID:
        return UserObj({"tg_id": tg_id, "role": "ADMIN", "fio": "Master Admin"})
        
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
    
    # Аварийный вход для админа при регистрации
    if tg_id == MASTER_ADMIN_ID:
        return UserObj({"tg_id": tg_id, "role": "ADMIN", "fio": "Master Admin"})
        
    return UserObj({"tg_id": tg_id, "role": "BUYER"})