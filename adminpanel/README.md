# Flurai — Админ-панель и Seller-панель

Монорепо с двумя React-приложениями (pnpm workspaces): Admin Panel (`admin.flurai.ru`) и Seller Panel (`seller.flurai.ru`).

## Запуск

### Разработка

```bash
# Установка зависимостей
pnpm install

# Admin Panel — http://localhost:3001
pnpm dev:admin

# Seller Panel — http://localhost:3002
pnpm dev:seller
```

Требуется запущенный backend (`http://localhost:8000`).

### Production

```bash
# Сборка обоих приложений
pnpm build

# Или по отдельности
pnpm build:admin
pnpm build:seller
```

Для production задайте `VITE_API_URL` в `.env` — URL бэкенда.

## Авторизация

- **Admin Panel**: логин и пароль из `.env` (`ADMIN_LOGIN`, `ADMIN_PASSWORD`)
- **Seller Panel**: JWT-авторизация через `X-Seller-Token`

## Структура

```
adminpanel/
├── packages/shared/        # @flurai/shared — UI kit, hooks, utils, styles
├── packages/admin-panel/   # @flurai/admin-panel
└── packages/seller-panel/  # @flurai/seller-panel
```
