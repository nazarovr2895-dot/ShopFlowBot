import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import {
  ShopsList,
  MyFlowers,
  ShopDetails,
  Cart,
  Checkout,
  VisitedSellers,
  Profile,
  OrdersList,
  OrderDetail,
  ProductDetail,
} from './pages';
import { MainLayout } from './components';
import { useTelegramWebApp } from './hooks/useTelegramWebApp';
import { api } from './api/client';
import { useLocationCache } from './hooks/useLocationCache';
import './App.css';

function AppContent() {
  const { webApp } = useTelegramWebApp();
  const { setFilters } = useLocationCache();

  // Use FlowShop dark theme from App.css; skip Telegram theme to keep consistent design
  useEffect(() => {
    // Optional: could respect Telegram theme here by setting --app-* from theme
  }, [webApp.themeParams]);

  // Sync filters from user profile if they have city_id (non-blocking; no prompt on entry)
  useEffect(() => {
    let cancelled = false;
    api.getCurrentUser().then((user) => {
      if (cancelled || !user.city_id) return;
      const updatedFilters: { city_id: number; district_id?: number } = {
        city_id: user.city_id,
      };
      if (user.district_id != null) updatedFilters.district_id = user.district_id;
      setFilters((prev) => ({ ...prev, ...updatedFilters }));
      try {
        const STORAGE_KEY = 'flowshop_location_filters';
        const existing = localStorage.getItem(STORAGE_KEY);
        const cached = existing ? JSON.parse(existing) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cached, ...updatedFilters, timestamp: Date.now() }));
      } catch (e) {
        console.error('Failed to update localStorage:', e);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [setFilters]);

  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<MyFlowers />} />
        <Route path="catalog" element={<ShopsList />} />
        <Route path="visited" element={<VisitedSellers />} />
        <Route path="cart" element={<Cart />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="/cart/checkout" element={<Checkout />} />
      <Route path="/shop/:sellerId" element={<ShopDetails />} />
      <Route path="/shop/:sellerId/product/:productId" element={<ProductDetail />} />
      <Route path="/orders" element={<OrdersList />} />
      <Route path="/order/:orderId" element={<OrderDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AppContent />
    </BrowserRouter>
  );
}
