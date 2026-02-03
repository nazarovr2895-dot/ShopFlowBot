import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Sellers } from './pages/Sellers';
import { Agents } from './pages/Agents';
import { Stats } from './pages/Stats';
import { StatsSellers } from './pages/StatsSellers';
import { StatsAgents } from './pages/StatsAgents';
import { SellerDashboard } from './pages/seller/SellerDashboard';
import { SellerOrders } from './pages/seller/SellerOrders';
import { SellerShop } from './pages/seller/SellerShop';
import { SellerReceptions } from './pages/seller/SellerReceptions';
import { SellerBouquets } from './pages/seller/SellerBouquets';
import { SellerInventory } from './pages/seller/SellerInventory';
import { SellerStats } from './pages/seller/SellerStats';
import { SellerProfile } from './pages/seller/SellerProfile';
import { SellerSecurity } from './pages/seller/SellerSecurity';
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
            <Route path="agents" element={<Agents />} />
            <Route path="stats" element={<Stats />} />
            <Route path="stats/sellers" element={<StatsSellers />} />
            <Route path="stats/agents" element={<StatsAgents />} />
          </>
        )}
        {isSeller && (
          <>
            <Route path="orders" element={<SellerOrders />} />
            <Route path="shop" element={<SellerShop />} />
            <Route path="receptions" element={<SellerReceptions />} />
            <Route path="bouquets" element={<SellerBouquets />} />
            <Route path="inventory" element={<SellerInventory />} />
            <Route path="stats" element={<SellerStats />} />
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
