import aiohttp
from typing import Optional
import logging
import asyncio
from bot.config import BACKEND_URL, INTERNAL_API_KEY

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
                timeout=aiohttp.ClientTimeout(total=10),
                connector=aiohttp.TCPConnector(limit=100, force_close=True)
            )
        return cls._session

    @classmethod
    async def close(cls) -> None:
        """Закрыть сессию при остановке приложения."""
        if cls._session and not cls._session.closed:
            await cls._session.close()
            cls._session = None


async def _handle_response(response: aiohttp.ClientResponse, url: str):
    """Unified response handling: error check, content-type, JSON parse."""
    if response.status >= 400:
        error_text = await response.text()
        logger.error("API error %d for %s: %s", response.status, url, error_text)
        return None

    if response.content_type != "application/json":
        logger.warning("Non-JSON response from %s, content-type: %s", url, response.content_type)
        return {"status": response.status}

    return await response.json()


# Method dispatch table
_METHOD_MAP = {
    "POST": lambda s, url, **kw: s.post(url, json=kw.get("data"), headers=kw.get("headers")),
    "GET": lambda s, url, **kw: s.get(url, params=kw.get("params"), headers=kw.get("headers")),
    "PUT": lambda s, url, **kw: s.put(url, json=kw.get("data"), params=kw.get("params"), headers=kw.get("headers")),
    "DELETE": lambda s, url, **kw: s.delete(url, params=kw.get("params"), headers=kw.get("headers")),
}


async def make_request(method: str, endpoint: str, data: dict = None, params: dict = None, headers: dict = None):
    """
    Выполнить HTTP запрос к backend API.
    Использует singleton ClientSession для эффективного переиспользования соединений.
    """
    url = f"{BACKEND_URL}{endpoint}"
    session = await APIClient.get_session()
    req_headers = dict(headers or {})
    if INTERNAL_API_KEY:
        req_headers["X-Internal-Key"] = INTERNAL_API_KEY

    dispatch = _METHOD_MAP.get(method.upper())
    if not dispatch:
        logger.error("Unsupported HTTP method: %s", method)
        return None

    try:
        async with dispatch(session, url, data=data, params=params, headers=req_headers or None) as response:
            return await _handle_response(response, url)
    except asyncio.TimeoutError:
        logger.error("Timeout: backend did not respond in 10s for %s", url)
        return None
    except aiohttp.ServerTimeoutError:
        logger.error("Timeout: backend did not respond in 10s for %s", url)
        return None
    except aiohttp.ClientConnectorError:
        logger.error("Connection error: cannot connect to %s", url)
        return None
    except aiohttp.ClientOSError as e:
        logger.error("Network error (errno %s) for %s: %s", e.errno, url, e)
        return None
    except aiohttp.ClientError as e:
        logger.error("Client error for %s: %s: %s", url, type(e).__name__, e)
        return None
    except Exception as e:
        logger.error("Unexpected error for %s: %s: %s", url, type(e).__name__, e, exc_info=True)
        return None
