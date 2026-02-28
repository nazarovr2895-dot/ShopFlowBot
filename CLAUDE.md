# Flurai

E-commerce платформа через Telegram Mini App: Backend (FastAPI), Bot (aiogram 3.x), Mini App (React/Vite), Admin Panel + Seller Panel (React/Vite monorepo).

## Архитектура (non-obvious)

- Два набора order-endpoints: `/orders/` (бот, internal) и `/seller-web/orders/` (seller panel, JWT)
- Auth: `INTERNAL_API_KEY` для bot→backend, `X-Seller-Token` JWT для seller panel, `X-Admin-Token` для platform admin
- Payment: YooKassa split payments (marketplace transfers)
- Все user-facing строки — на русском

### Frontend monorepo (`adminpanel/`)

Admin Panel и Seller Panel — два отдельных React-приложения с общим shared-пакетом (pnpm workspaces):

```
adminpanel/
├── packages/shared/        # @flurai/shared — UI kit, hooks, utils, styles
├── packages/admin-panel/   # @flurai/admin-panel → admin.flurai.ru
└── packages/seller-panel/  # @flurai/seller-panel → seller.flurai.ru
```

- `pnpm dev:admin` — dev admin panel (порт 3001)
- `pnpm dev:seller` — dev seller panel (порт 3002)
- `pnpm build` — собрать оба

## Деплой

```bash
./deploy.sh "feat: описание"
```

При первом деплое с seller panel:
1. Выпустить SSL-сертификат для `seller.flurai.ru`
2. Добавить `https://seller.flurai.ru` в `ALLOWED_ORIGINS` в .env на сервере
3. Обновить `SELLER_MINI_APP_URL` в .env на сервере

## Известные gotchas

- **photo_id vs file_id**: В БД у товаров `photo_id`/`photo_ids` должны быть пути `/static/uploads/products/...`, а не Telegram file_id. Mini App не отобразит фото с file_id.
- **VITE_API_URL**: При сборке Mini App обязательно передавать `VITE_API_URL` (или `PUBLIC_API_URL` в docker-compose), иначе `config.json` будет с неправильным `apiUrl`.
- **Старая директория `adminpanel/src/`**: Легаси — не используется. Код живёт в `adminpanel/packages/`.

## Соглашения

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
