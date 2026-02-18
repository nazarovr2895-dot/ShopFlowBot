import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  Landing,
  ShopsList,
  MyFlowers,
  ShopDetails,
  Cart,
  Checkout,
  FavoriteProducts,
  Profile,
  OrderDetail,
  ProductDetail,
  GuestCheckout,
  GuestOrderConfirmation,
} from './pages';
import { MainLayout, RequireAuth } from './components';
import { CatalogFilterProvider } from './contexts/CatalogFilterContext';
import { useTheme } from './hooks/useTheme';
import { api } from './api/client';
import { useLocationCache } from './hooks/useLocationCache';
import type { SellerFilters } from './types';
import { isTelegram, getTelegramInitData } from './utils/environment';
import './App.css';

function AppContent() {
  const { setFilters } = useLocationCache();
  const [authInitialized, setAuthInitialized] = useState(false);
  
  // Initialize theme system (integrates with Telegram colorScheme internally)
  useTheme();

  // Auto-authenticate in Telegram using initData
  useEffect(() => {
    const initAuth = async () => {
      if (isTelegram()) {
        const initData = getTelegramInitData();
        if (initData && !api.isAuthenticated()) {
          try {
            await api.authWithMiniApp(initData);
            console.log('[App] Auto-authenticated via Telegram initData');
          } catch (error) {
            console.error('[App] Failed to auto-authenticate:', error);
          }
        }
      }
      setAuthInitialized(true);
    };

    initAuth();
  }, []);

  // Theme is now managed by useTheme hook which integrates with Telegram colorScheme

  // Sync filters from user profile if they have city_id (non-blocking; no prompt on entry)
  useEffect(() => {
    if (!authInitialized) return;
    
    // Only sync if user is authenticated
    if (!api.isAuthenticated()) return;
    
    let cancelled = false;
    api.getCurrentUser().then((user) => {
      if (cancelled || !user.city_id) return;
      const updatedFilters: { city_id: number; district_id?: number } = {
        city_id: user.city_id,
      };
      if (user.district_id != null) updatedFilters.district_id = user.district_id;
      setFilters((prev: SellerFilters) => ({ ...prev, ...updatedFilters }));
      try {
        const STORAGE_KEY = 'flowshop_location_filters';
        const existing = localStorage.getItem(STORAGE_KEY);
        const cached = existing ? JSON.parse(existing) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cached, ...updatedFilters, timestamp: Date.now() }));
      } catch (e) {
        console.error('Failed to update localStorage:', e);
      }
    }).catch(() => {
      // Silently ignore errors (user might not be authenticated)
    });
    return () => { cancelled = true; };
  }, [setFilters, authInitialized]);

  if (!authInitialized) {
    // Show loading state while initializing auth
    return null;
  }

  return (
    <Routes>
      {/* Landing page for browser authentication */}
      <Route path="/landing" element={<Landing />} />
      
      {/* Main layout: no auth required in browser; auth offered in Profile */}
      <Route element={<CatalogFilterProvider><MainLayout /></CatalogFilterProvider>}>
        <Route index element={<MyFlowers />} />
        <Route path="catalog" element={<ShopsList />} />
        <Route path="favorites" element={<FavoriteProducts />} />
        <Route path="cart" element={<Cart />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="/cart/checkout" element={<RequireAuth from="checkout"><Checkout /></RequireAuth>} />
      <Route path="/cart/guest-checkout" element={<GuestCheckout />} />
      <Route path="/order/guest-confirm" element={<GuestOrderConfirmation />} />
      <Route path="/shop/:sellerId" element={<ShopDetails />} />
      <Route path="/shop/:sellerId/product/:productId" element={<ProductDetail />} />
      <Route path="/order/:orderId" element={<RequireAuth from="orders"><OrderDetail /></RequireAuth>} />
      
      {/* Redirect root to appropriate page */}
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
