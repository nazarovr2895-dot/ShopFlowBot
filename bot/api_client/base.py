import aiohttp
from bot.config import BACKEND_URL # Убедись, что добавишь этот URL в config.py позже

class BaseClient:
    def __init__(self):
        # Пока используем localhost, позже это будет адрес контейнера backend
        self.base_url = "http://backend:8000" 

    async def _post(self, endpoint: str, data: dict):
        # Это заготовка для будущего HTTP запроса
        # async with aiohttp.ClientSession() as session:
        #     async with session.post(f"{self.base_url}{endpoint}", json=data) as resp:
        #         return await resp.json()
        pass

    async def _get(self, endpoint: str, params: dict = None):
        # async with aiohttp.ClientSession() as session:
        #     async with session.get(f"{self.base_url}{endpoint}", params=params) as resp:
        #         return await resp.json()
        pass