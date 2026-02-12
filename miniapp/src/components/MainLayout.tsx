import { Outlet, Link } from 'react-router-dom';
import { TopNav } from './TopNav';
import { api } from '../api/client';
import { isBrowser, isTelegram } from '../utils/environment';
import './MainLayout.css';

export function MainLayout() {
  const showLoginLink = isBrowser() && !api.isAuthenticated();
  const isTelegramEnv = isTelegram();

  return (
    <div className={`main-layout ${isTelegramEnv ? 'main-layout--telegram' : ''}`} data-telegram={isTelegramEnv}>
      <TopNav />
      {showLoginLink && (
        <header className="main-layout__header">
          <Link to="/" className="main-layout__brand">FlowShop</Link>
          <Link to="/profile" className="main-layout__login-link">Войти</Link>
        </header>
      )}
      <main className="main-layout__content">
        <Outlet />
      </main>
    </div>
  );
}
