import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider, ConfirmProvider } from './components/ui';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { useTelegramWebApp } from './hooks/useTelegramWebApp';
import { isTelegram } from './utils/environment';

/* ── Admin pages ─────────────────────────────────────────── */
import { Dashboard } from './pages/Dashboard';
import { Sellers } from './pages/Sellers';
import { AdminAnalytics } from './pages/admin/AdminAnalytics';
import { AdminOrders } from './pages/admin/AdminOrders';
import { AdminCustomers } from './pages/admin/AdminCustomers';
import { AdminFinance } from './pages/admin/AdminFinance';
import { AdminCoverage } from './pages/admin/AdminCoverage';

/* ── Seller pages ────────────────────────────────────────── */
import { SellerDashboard } from './pages/seller/SellerDashboard';
import { SellerOrders } from './pages/seller/SellerOrders';
import { SellerOrderDetail } from './pages/seller/SellerOrderDetail';
import { SellerCatalog } from './pages/seller/SellerCatalog';
import { SellerStock } from './pages/seller/SellerStock';
import { SellerCustomerHub } from './pages/seller/SellerCustomerHub';
import { SellerCustomers } from './pages/seller/SellerCustomers';
import { SellerAnalytics } from './pages/seller/SellerAnalytics';
import { SellerSettings } from './pages/seller/SellerSettings';
import { SellerBranches } from './pages/seller/SellerBranches';

import './index.css';
import './App.css';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const hasAdminToken = typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('admin_token');
  const hasSellerToken = typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('seller_token');
  if (!hasAdminToken && !hasSellerToken && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { role, telegramAuthLoading, telegramAuthError } = useAuth();
  const isAdmin = role === 'admin';
  const isSeller = role === 'seller';

  // Initialize Telegram WebApp SDK
  useTelegramWebApp();

  // Show loading while Telegram auth is in progress
  if (telegramAuthLoading) {
    return (
      <div className="tg-auth-loading">
        <div className="tg-auth-loading__spinner" />
        <p>Авторизация...</p>
      </div>
    );
  }

  // Show error if Telegram auth failed (user is not admin/seller)
  if (isTelegram() && telegramAuthError && !role) {
    return (
      <div className="tg-auth-loading">
        <p className="tg-auth-loading__error">{telegramAuthError}</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        {/* ── Dashboard ──────────────────────────────────── */}
        <Route index element={isSeller ? <SellerDashboard /> : <Dashboard />} />

        {/* ── Admin routes ───────────────────────────────── */}
        {isAdmin && (
          <>
            <Route path="orders" element={<AdminOrders />} />
            <Route path="sellers" element={<Sellers />} />
            <Route path="customers" element={<AdminCustomers />} />
            <Route path="finance" element={<AdminFinance />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="coverage" element={<AdminCoverage />} />
            {/* Legacy redirects */}
            <Route path="stats" element={<Navigate to="/analytics" replace />} />
            <Route path="stats/sellers" element={<Navigate to="/analytics?tab=sellers" replace />} />
          </>
        )}

        {/* ── Seller routes ──────────────────────────────── */}
        {isSeller && (
          <>
            <Route path="orders" element={<SellerOrders />} />
            <Route path="orders/:orderId" element={<SellerOrderDetail />} />
            <Route path="catalog" element={<SellerCatalog />} />
            <Route path="stock" element={<SellerStock />} />
            <Route path="customers" element={<SellerCustomerHub />} />
            <Route path="customers/:id" element={<SellerCustomers />} />
            <Route path="analytics" element={<SellerAnalytics />} />
            <Route path="branches" element={<SellerBranches />} />
            <Route path="settings" element={<SellerSettings />} />
            {/* Legacy redirects for old URLs */}
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
          </>
        )}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
