# Flurai

E-commerce платформа через Telegram Mini App: Backend (FastAPI), Bot (aiogram 3.x), Mini App + Admin Panel (React/Vite).

## Архитектура (non-obvious)

- Два набора order-endpoints: `/orders/` (бот, internal) и `/seller-web/orders/` (админка, JWT)
- Auth: `INTERNAL_API_KEY` для bot→backend, `X-Seller-Token` JWT для админки, `X-Admin-Token` для platform admin
- Payment: YooKassa split payments (marketplace transfers)
- Все user-facing строки — на русском

## Деплой

```bash
./deploy.sh "feat: описание"
```

## Известные gotchas

- **photo_id vs file_id**: В БД у товаров `photo_id`/`photo_ids` должны быть пути `/static/uploads/products/...`, а не Telegram file_id. Mini App не отобразит фото с file_id.
- **VITE_API_URL**: При сборке Mini App обязательно передавать `VITE_API_URL` (или `PUBLIC_API_URL` в docker-compose), иначе `config.json` будет с неправильным `apiUrl`.

## Соглашения

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
