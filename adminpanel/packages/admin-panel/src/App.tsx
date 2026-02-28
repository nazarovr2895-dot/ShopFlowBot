import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from './contexts/AdminAuthContext';
import { ToastProvider, ConfirmProvider } from '@shared/components/ui';
import { AdminLayout } from './components/layout/AdminLayout';
import { AdminLogin } from './pages/AdminLogin';
import { useTelegramWebApp } from '@shared/hooks/useTelegramWebApp';
import { isTelegram } from '@shared/utils/environment';

import { Dashboard } from './pages/Dashboard';
import { Sellers } from './pages/Sellers';
import { AdminAnalytics } from './pages/admin/AdminAnalytics';
import { AdminOrders } from './pages/admin/AdminOrders';
import { AdminCustomers } from './pages/admin/AdminCustomers';
import { AdminFinance } from './pages/admin/AdminFinance';
import { AdminCoverage } from './pages/admin/AdminCoverage';

import '@shared/styles/index.css';
import '@shared/styles/app.css';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAdminAuth();
  if (!isAuthenticated && !sessionStorage.getItem('admin_token')) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { telegramAuthLoading, telegramAuthError } = useAdminAuth();
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
      <Route path="/login" element={<AdminLogin />} />
      <Route path="/" element={<PrivateRoute><AdminLayout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="sellers" element={<Sellers />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="finance" element={<AdminFinance />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="coverage" element={<AdminCoverage />} />
        <Route path="stats" element={<Navigate to="/analytics" replace />} />
        <Route path="stats/sellers" element={<Navigate to="/analytics?tab=sellers" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <AdminAuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </AdminAuthProvider>
  );
}
