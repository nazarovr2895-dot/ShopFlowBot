---
name: adding-react-page
description: Add a new React page to the Mini App, Seller Panel, or Admin Panel following Flurai patterns. Use when creating new frontend pages or views.
argument-hint: [miniapp | seller | admin] [page-name]
---

# Adding a React Page

Three React apps with different patterns. Always match the target app's conventions.

## Mini App (`miniapp/src/pages/`)

### Page Component:
```tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Loader } from '../components/Loader';

export function MyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<MyType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await api.getData(id!);
        setData(result);
      } catch (err) {
        console.error('[MyPage] Load failed:', err);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return <Loader />;
  if (!data) return <div className="empty-state">Не найдено</div>;

  return (
    <div className="my-page">
      {/* content */}
    </div>
  );
}
```

### Route Registration (`miniapp/src/App.tsx`):
```tsx
import { MyPage } from './pages/MyPage';
// Inside <Routes>:
<Route path="/my-page" element={<MyPage />} />
<Route path="/my-page/:id" element={<MyPage />} />  // with param
```

### Available Components:
- `Loader` — loading spinner
- `MainLayout` — app layout wrapper
- `TopNav` — top navigation bar
- `BottomNav` — bottom tab bar
- `EmptyState` — empty state placeholder
- `Toast` / `ToastProvider` — notifications
- `ShopCartProvider` — cart context
- `RequireAuth` — protected route wrapper

### API Client:
```tsx
import { api } from '../api/client';
// api.getOrder(id), api.getProducts(), etc.
// Uses X-Telegram-Init-Data or JWT auth automatically
```

### Contexts:
- `ShopCartProvider` — cart state
- `CatalogFilterProvider` — catalog filtering
- Auth: `api.isAuthenticated()`, `hasTelegramAuth()`

---

## Seller Panel (`adminpanel/packages/seller-panel/src/pages/`)

### Page Component:
```tsx
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast, useConfirm, PageHeader, Loader, EmptyState } from '@flurai/shared';
import { useSellerAuth } from '../contexts/SellerAuthContext';

export function MySellerPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { seller_id } = useSellerAuth();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<MyType[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchMyData();
      setData(result);
    } catch (err) {
      toast.error(String(err));
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) return <Loader />;
  if (!data.length) return <EmptyState message="Данных пока нет" />;

  return (
    <div className="my-seller-page">
      <PageHeader title="Мой раздел" />
      {/* content */}
    </div>
  );
}
```

### Route Registration (`seller-panel/src/App.tsx`):
```tsx
import { MySellerPage } from './pages/seller/MySellerPage';
// Inside SellerLayout nested routes:
<Route path="my-section" element={<MySellerPage />} />
```

### Auth & API:
```tsx
import { useSellerAuth } from '../contexts/SellerAuthContext';
// useSellerAuth() → { isAuthenticated, isNetworkOwner, seller_id, owner_id }

// API calls use fetchSeller<T>():
import { fetchSeller } from '../api/sellerClient';
const data = await fetchSeller<MyType[]>('/seller-web/my-endpoint');
// Automatically adds X-Seller-Token header
```

### Shared UI (`@flurai/shared`):
- `PageHeader` — page title with optional actions
- `TabBar` — tab navigation
- `FormField` — form input wrapper
- `EmptyState` — empty state display
- `Loader` — loading spinner
- `useToast()` — toast notifications (`toast.success()`, `toast.error()`)
- `useConfirm()` — confirmation dialog

### Route Protection:
All seller routes wrap in `<PrivateRoute>` — redirects to `/login` if no token.

---

## Admin Panel (`adminpanel/packages/admin-panel/src/pages/`)

Same pattern as Seller Panel but with admin auth:
```tsx
import { useAdminAuth } from '../contexts/AdminAuthContext';
// Admin API:
import { fetchAdmin } from '../api/adminClient';
const data = await fetchAdmin<MyType[]>('/admin/my-endpoint');
// Automatically adds X-Admin-Token header
```

---

## Checklist

- [ ] Create page component in correct `pages/` directory
- [ ] Register route in `App.tsx`
- [ ] Add navigation link (sidebar, BottomNav, or menu) if needed
- [ ] All user-facing strings in Russian
- [ ] Use existing shared components (`@flurai/shared`)
- [ ] Handle loading state (`Loader`)
- [ ] Handle empty state (`EmptyState`)
- [ ] Handle errors (`toast.error()`)
- [ ] File naming: `PascalCase.tsx` for components

## Reference Files

- `miniapp/src/App.tsx` — Mini App routing
- `adminpanel/packages/seller-panel/src/App.tsx` — Seller Panel routing
- `adminpanel/packages/admin-panel/src/App.tsx` — Admin Panel routing
- `adminpanel/packages/shared/src/components/` — shared UI components
