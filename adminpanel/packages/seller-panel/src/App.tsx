import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SellerAuthProvider, useSellerAuth } from './contexts/SellerAuthContext';
import { ToastProvider, ConfirmProvider } from '@shared/components/ui';
import { SellerLayout } from './components/layout/SellerLayout';
import { SellerLogin } from './pages/SellerLogin';
import { useTelegramWebApp } from '@shared/hooks/useTelegramWebApp';
import { isTelegram } from '@shared/utils/environment';

import { SellerDashboard } from './pages/seller/SellerDashboard';
import { NetworkDashboard } from './pages/seller/NetworkDashboard';
import { SellerOrders } from './pages/seller/SellerOrders';
import { SellerOrderDetail } from './pages/seller/SellerOrderDetail';
import { SellerCatalog } from './pages/seller/SellerCatalog';
import { SellerStock } from './pages/seller/SellerStock';
import { SellerCustomerHub } from './pages/seller/SellerCustomerHub';
import { SellerCustomers } from './pages/seller/SellerCustomers';
import { SellerAnalytics } from './pages/seller/SellerAnalytics';
import { SellerSettings } from './pages/seller/SellerSettings';
import { SellerBranches } from './pages/seller/SellerBranches';

import '@shared/styles/index.css';
import '@shared/styles/app.css';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useSellerAuth();
  if (!isAuthenticated && !sessionStorage.getItem('seller_token')) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { isNetworkOwner, telegramAuthLoading, telegramAuthError } = useSellerAuth();
  useTelegramWebApp();

  if (telegramAuthLoading) {
    return (
      <div className="tg-auth-loading">
        <div className="tg-auth-loading__spinner" />
        <p>Авторизация...</p>
      </div>
    );
  }

  if (isTelegram() && telegramAuthError) {
    return (
      <div className="tg-auth-loading">
        <p className="tg-auth-loading__error">{telegramAuthError}</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<SellerLogin />} />
      <Route path="/" element={<PrivateRoute><SellerLayout /></PrivateRoute>}>
        <Route index element={isNetworkOwner ? <NetworkDashboard /> : <SellerDashboard />} />
        <Route path="orders" element={isNetworkOwner ? <Navigate to="/" replace /> : <SellerOrders />} />
        <Route path="orders/:orderId" element={isNetworkOwner ? <Navigate to="/" replace /> : <SellerOrderDetail />} />
        <Route path="catalog" element={isNetworkOwner ? <Navigate to="/" replace /> : <SellerCatalog />} />
        <Route path="stock" element={isNetworkOwner ? <Navigate to="/" replace /> : <SellerStock />} />
        <Route path="customers" element={<SellerCustomerHub />} />
        <Route path="customers/:id" element={<SellerCustomers />} />
        <Route path="analytics" element={<SellerAnalytics />} />
        <Route path="branches" element={<SellerBranches />} />
        <Route path="settings" element={<SellerSettings />} />
        {/* Legacy redirects */}
        <Route path="shop" element={<Navigate to="/settings?tab=shop" replace />} />
        <Route path="showcase" element={<Navigate to="/catalog?tab=showcase" replace />} />
        <Route path="receptions" element={<Navigate to="/stock?tab=receptions" replace />} />
        <Route path="bouquets" element={<Navigate to="/catalog?tab=bouquets" replace />} />
        <Route path="inventory" element={<Navigate to="/stock?tab=inventory" replace />} />
        <Route path="stats" element={<Navigate to="/analytics" replace />} />
        <Route path="waste-report" element={<Navigate to="/stock?tab=writeoffs" replace />} />
        <Route path="profile" element={<Navigate to="/settings?tab=account" replace />} />
        <Route path="security" element={<Navigate to="/settings?tab=account" replace />} />
        <Route path="subscribers" element={<Navigate to="/customers?tab=subscribers" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <SellerAuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </SellerAuthProvider>
  );
}
