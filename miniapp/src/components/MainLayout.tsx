import { Outlet, Link } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { api } from '../api/client';
import { isBrowser } from '../utils/environment';
import './MainLayout.css';

export function MainLayout() {
  const showBottomNav = !isBrowser();
  const showLoginLink = isBrowser() && !api.isAuthenticated();

  return (
    <div className="main-layout">
      {showLoginLink && (
        <header className="main-layout__header">
          <Link to="/" className="main-layout__brand">FlowShop</Link>
          <Link to="/profile" className="main-layout__login-link">Войти</Link>
        </header>
      )}
      <main className="main-layout__content">
        <Outlet />
      </main>
      {showBottomNav && <BottomNav />}
    </div>
  );
}
