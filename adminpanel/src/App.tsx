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
import './index.css';
import './App.css';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  // When no token in session, redirect to login
  const hasToken = typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('admin_token');
  if (!hasToken && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
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
        <Route index element={<Dashboard />} />
        <Route path="sellers" element={<Sellers />} />
        <Route path="agents" element={<Agents />} />
        <Route path="stats" element={<Stats />} />
        <Route path="stats/sellers" element={<StatsSellers />} />
        <Route path="stats/agents" element={<StatsAgents />} />
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
