import aiohttp
from bot.config import BACKEND_URL

async def make_request(method: str, endpoint: str, data: dict = None, params: dict = None):
    url = f"{BACKEND_URL}{endpoint}"
    async with aiohttp.ClientSession() as session:
        try:
            if method == "POST":
                async with session.post(url, json=data) as response:
                    # Если ответ пустой или не JSON, вернем просто статус
                    if response.content_type != "application/json":
                         return {"status": response.status}
                    return await response.json()
            elif method == "GET":
                async with session.get(url, params=params) as response:
                    if response.content_type != "application/json":
                         return {"status": response.status}
                    return await response.json()
        except Exception as e:
            print(f"❌ Ошибка запроса к API {url}: {e}")
            return None
# import aiohttp
# from bot.config import BACKEND_URL # Убедись, что добавишь этот URL в config.py позже

# class BaseClient:
#     def __init__(self):
#         # Пока используем localhost, позже это будет адрес контейнера backend
#         self.base_url = "http://backend:8000" 

#     async def _post(self, endpoint: str, data: dict):
#         # Это заготовка для будущего HTTP запроса
#         # async with aiohttp.ClientSession() as session:
#         #     async with session.post(f"{self.base_url}{endpoint}", json=data) as resp:
#         #         return await resp.json()
#         pass

#     async def _get(self, endpoint: str, params: dict = None):
#         # async with aiohttp.ClientSession() as session:
#         #     async with session.get(f"{self.base_url}{endpoint}", params=params) as resp:
#         #         return await resp.json()
#         pass