import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Sellers } from './pages/Sellers';
import { Stats } from './pages/Stats';
import { StatsSellers } from './pages/StatsSellers';
import { SellerDashboard } from './pages/seller/SellerDashboard';
import { SellerOrders } from './pages/seller/SellerOrders';
import { SellerShop } from './pages/seller/SellerShop';
import { SellerReceptions } from './pages/seller/SellerReceptions';
import { SellerBouquets } from './pages/seller/SellerBouquets';
import { SellerInventory } from './pages/seller/SellerInventory';
import { SellerStats } from './pages/seller/SellerStats';
import { SellerProfile } from './pages/seller/SellerProfile';
import { SellerSecurity } from './pages/seller/SellerSecurity';
import { SellerCustomers } from './pages/seller/SellerCustomers';
import { SellerOrderDetail } from './pages/seller/SellerOrderDetail';
import { SellerShowcase } from './pages/seller/SellerShowcase';
import { SellerSubscribers } from './pages/seller/SellerSubscribers';
import { SellerWasteReport } from './pages/seller/SellerWasteReport';
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
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const isSeller = role === 'seller';

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
        <Route index element={isSeller ? <SellerDashboard /> : <Dashboard />} />
        {isAdmin && (
          <>
            <Route path="sellers" element={<Sellers />} />
            <Route path="stats" element={<Stats />} />
            <Route path="stats/sellers" element={<StatsSellers />} />
          </>
        )}
        {isSeller && (
          <>
            <Route path="orders" element={<SellerOrders />} />
            <Route path="orders/:orderId" element={<SellerOrderDetail />} />
            <Route path="customers" element={<SellerCustomers />} />
            <Route path="customers/:id" element={<SellerCustomers />} />
            <Route path="subscribers" element={<SellerSubscribers />} />
            <Route path="shop" element={<SellerShop />} />
            <Route path="showcase" element={<SellerShowcase />} />
            <Route path="receptions" element={<SellerReceptions />} />
            <Route path="bouquets" element={<SellerBouquets />} />
            <Route path="inventory" element={<SellerInventory />} />
            <Route path="stats" element={<SellerStats />} />
            <Route path="waste-report" element={<SellerWasteReport />} />
            <Route path="profile" element={<SellerProfile />} />
            <Route path="security" element={<SellerSecurity />} />
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
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
