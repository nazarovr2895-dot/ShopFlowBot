import { Outlet } from 'react-router-dom';
import { TopNav } from './TopNav';
import { isTelegram } from '../utils/environment';
import './MainLayout.css';

export function MainLayout() {
  const isTelegramEnv = isTelegram();

  return (
    <div className={`main-layout ${isTelegramEnv ? 'main-layout--telegram' : ''}`} data-telegram={isTelegramEnv}>
      <TopNav />
      <main className="main-layout__content">
        <Outlet />
      </main>
    </div>
  );
}
