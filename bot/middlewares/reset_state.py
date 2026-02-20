from typing import Any, Awaitable, Callable, Dict
from aiogram import BaseMiddleware
from aiogram.types import Message
from aiogram.fsm.context import FSMContext

class ResetStateMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[Message, Dict[str, Any]], Awaitable[Any]],
        event: Message,
        data: Dict[str, Any]
    ) -> Any:
        state: FSMContext = data.get("state")
        
        # Список текстов всех кнопок главного меню
        main_buttons = [
            "📥 Заказы", "👑 Вернуться в АДМИН-ПАНЕЛЬ",
            "➕ Добавить товар", "📦 Мои товары", "⚙️ Настройка магазина",
            "🔗 Моя ссылка", "👁 Посмотреть магазин", "🔄 Перейти в режим покупателя",
"🔁 Режим покупателя"
        ]

# ... (начало файла без изменений)
        # Если текст сообщения совпадает с кнопкой меню
        if event.text in main_buttons:
            current_state = await state.get_state()
            if current_state:
                # МЕНЯЕМ clear() на set_state(None)
                # Это сбросит только "зависший вопрос", но ОСТАВИТ корзину и данные
                await state.set_state(None) 
                # print(f"DEBUG: Состояние {current_state} сброшено, данные сохранены")

        return await handler(event, data)
        