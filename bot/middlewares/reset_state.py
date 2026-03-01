from typing import Any, Awaitable, Callable, Dict
from aiogram import BaseMiddleware
from aiogram.types import Message
from aiogram.fsm.context import FSMContext


MAIN_MENU_BUTTONS = [
    "📥 Заказы", "👑 Вернуться в АДМИН-ПАНЕЛЬ",
    "➕ Добавить товар", "📦 Мои товары", "⚙️ Настройка магазина",
    "🔗 Моя ссылка", "👁 Посмотреть магазин", "🔄 Перейти в режим покупателя",
    "🔁 Режим покупателя",
]


class ResetStateMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[Message, Dict[str, Any]], Awaitable[Any]],
        event: Message,
        data: Dict[str, Any],
    ) -> Any:
        state: FSMContext = data.get("state")

        # Если текст сообщения совпадает с кнопкой меню — сбрасываем FSM state,
        # но сохраняем данные (корзину и т.д.)
        if state and event.text in MAIN_MENU_BUTTONS:
            current_state = await state.get_state()
            if current_state:
                await state.set_state(None)

        return await handler(event, data)
