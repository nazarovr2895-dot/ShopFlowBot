import aiohttp
from typing import Optional
import logging
import asyncio
from bot.config import BACKEND_URL

logger = logging.getLogger(__name__)


class APIClient:
    """
    Singleton для управления aiohttp ClientSession.
    Переиспользует одну сессию для всех запросов вместо создания новой на каждый запрос.
    """
    _session: Optional[aiohttp.ClientSession] = None

    @classmethod
    async def get_session(cls) -> aiohttp.ClientSession:
        """Получить или создать общую сессию."""
        if cls._session is None or cls._session.closed:
            cls._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=10),  # Уменьшили таймаут до 10 секунд
                connector=aiohttp.TCPConnector(limit=100, force_close=True)  # Добавили force_close для избежания проблем с соединениями
            )
        return cls._session

    @classmethod
    async def close(cls) -> None:
        """Закрыть сессию при остановке приложения."""
        if cls._session and not cls._session.closed:
            await cls._session.close()
            cls._session = None


async def make_request(method: str, endpoint: str, data: dict = None, params: dict = None, headers: dict = None):
    """
    Выполнить HTTP запрос к backend API.
    Использует singleton ClientSession для эффективного переиспользования соединений.
    """
    url = f"{BACKEND_URL}{endpoint}"
    session = await APIClient.get_session()
    req_headers = dict(headers or {})

    try:
        if method == "POST":
            async with session.post(url, json=data, headers=req_headers or None) as response:
                # Проверяем статус ответа
                if response.status >= 400:
                    error_text = await response.text()
                    logger.error(f"❌ API ошибка {response.status} для {url}: {error_text}")
                    print(f"❌ API ошибка {response.status} для {url}: {error_text}")
                    return None
                
                # Если ответ пустой или не JSON, вернем просто статус
                if response.content_type != "application/json":
                    logger.warning(f"⚠️ Не JSON ответ от {url}, content-type: {response.content_type}")
                    return {"status": response.status}
                return await response.json()
        elif method == "GET":
            async with session.get(url, params=params, headers=req_headers or None) as response:
                if response.status >= 400:
                    error_text = await response.text()
                    logger.error(f"❌ API ошибка {response.status} для {url}: {error_text}")
                    print(f"❌ API ошибка {response.status} для {url}: {error_text}")
                    return None
                    
                if response.content_type != "application/json":
                    logger.warning(f"⚠️ Не JSON ответ от {url}, content-type: {response.content_type}")
                    return {"status": response.status}
                return await response.json()
        elif method == "PUT":
            async with session.put(url, json=data, params=params, headers=req_headers or None) as response:
                if response.status >= 400:
                    error_text = await response.text()
                    logger.error(f"❌ API ошибка {response.status} для {url}: {error_text}")
                    print(f"❌ API ошибка {response.status} для {url}: {error_text}")
                    return None
                    
                if response.content_type != "application/json":
                    logger.warning(f"⚠️ Не JSON ответ от {url}, content-type: {response.content_type}")
                    return {"status": response.status}
                return await response.json()
        elif method == "DELETE":
            async with session.delete(url, params=params, headers=req_headers or None) as response:
                if response.status >= 400:
                    error_text = await response.text()
                    logger.error(f"❌ API ошибка {response.status} для {url}: {error_text}")
                    print(f"❌ API ошибка {response.status} для {url}: {error_text}")
                    return None
                    
                if response.content_type != "application/json":
                    logger.warning(f"⚠️ Не JSON ответ от {url}, content-type: {response.content_type}")
                    return {"status": response.status}
                return await response.json()
    except asyncio.TimeoutError:
        error_msg = f"⏱️ ТАЙМАУТ: Backend не ответил за 10 секунд на {url}\n" \
                   f"   Проверьте, запущен ли backend: docker-compose up -d backend\n" \
                   f"   Или локально: cd backend && uvicorn app.main:app --reload --port 8000"
        logger.error(error_msg)
        print(error_msg)
        return None
    except aiohttp.ServerTimeoutError as e:
        error_msg = f"⏱️ ТАЙМАУТ: Backend не ответил за 10 секунд на {url}\n" \
                   f"   Проверьте, запущен ли backend: docker-compose up -d backend"
        logger.error(error_msg)
        print(error_msg)
        return None
    except aiohttp.ClientConnectorError as e:
        error_msg = f"🔌 ОШИБКА ПОДКЛЮЧЕНИЯ: Не удалось подключиться к {url}\n" \
                   f"   Backend не запущен или недоступен.\n" \
                   f"   Запустите: docker-compose up -d backend\n" \
                   f"   Или проверьте BACKEND_URL в .env файле"
        logger.error(error_msg)
        print(error_msg)
        return None
    except aiohttp.ClientOSError as e:
        # Обработка "Connection reset by peer" (Errno 54)
        if e.errno == 54:
            error_msg = f"🔄 СОЕДИНЕНИЕ СБРОШЕНО: Backend сбросил соединение для {url}\n" \
                       f"   Возможные причины:\n" \
                       f"   - Backend еще запускается (health: starting)\n" \
                       f"   - Backend падает при обработке запроса\n" \
                       f"   Проверьте логи: docker-compose logs backend\n" \
                       f"   Или проверьте health: curl http://localhost:8000/health"
        else:
            error_msg = f"🔌 ОШИБКА СЕТИ: {type(e).__name__} (errno {e.errno}) для {url}: {e}"
        logger.error(error_msg)
        print(error_msg)
        return None
    except aiohttp.ClientError as e:
        error_msg = f"❌ Ошибка соединения с API {url}: {type(e).__name__}: {e}"
        logger.error(error_msg)
        print(error_msg)
        return None
    except Exception as e:
        error_msg = f"❌ Неожиданная ошибка запроса к API {url}: {type(e).__name__}: {e}"
        logger.error(error_msg, exc_info=True)
        print(error_msg)
        return None