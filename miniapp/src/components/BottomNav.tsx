import { NavLink, useLocation } from 'react-router-dom';
import './BottomNav.css';

const tabs = [
  { path: '/', label: 'Каталог', icon: '🛍' },
  { path: '/visited', label: 'Вы смотрели', icon: '🕐' },
  { path: '/cart', label: 'Корзина', icon: '🛒' },
  { path: '/profile', label: 'Профиль', icon: '👤' },
] as const;

export function BottomNav() {
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <nav className="bottom-nav" role="navigation">
      {tabs.map(({ path, label, icon }) => {
        const isActive = path === '/' ? pathname === '/' : pathname.startsWith(path);
        return (
          <NavLink
            key={path}
            to={path}
            className={() => `bottom-nav__item ${isActive ? 'bottom-nav__item--active' : ''}`}
            end={path === '/'}
          >
            <span className="bottom-nav__icon">{icon}</span>
            <span className="bottom-nav__label">{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
