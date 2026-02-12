import { NavLink, useLocation } from 'react-router-dom';
import { LiquidGlassCard } from './LiquidGlassCard';
import { isTelegram } from '../utils/environment';
import './TopNav.css';

const FlowerIcon = ({ className }: { className?: string }) => (
  <img 
    src="/favicon-32x32.png" 
    alt="Мои цветочные"
    className={className}
    width="24"
    height="24"
    style={{ display: 'block' }}
  />
);

const BagIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

const HeartIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const CartIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);

const PersonIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const tabs = [
  { path: '/', label: 'Мои цветочные', Icon: FlowerIcon },
  { path: '/catalog', label: 'Каталог', Icon: BagIcon },
  { path: '/favorites', label: 'Избранное', Icon: HeartIcon },
  { path: '/cart', label: 'Корзина', Icon: CartIcon },
  { path: '/profile', label: 'Профиль', Icon: PersonIcon },
] as const;

export function TopNav() {
  const location = useLocation();
  const pathname = location.pathname;
  const isTelegramEnv = isTelegram();

  return (
    <nav className={`top-nav ${isTelegramEnv ? 'top-nav--telegram' : ''}`} role="navigation" data-telegram={isTelegramEnv}>
      <LiquidGlassCard className="top-nav__container">
        {tabs.map(({ path, label, Icon }) => {
          const isActive = path === '/' ? pathname === '/' : path === '/catalog' ? pathname === '/catalog' : pathname.startsWith(path);
          return (
            <NavLink
              key={path}
              to={path}
              className={() => `top-nav__item ${isActive ? 'top-nav__item--active' : ''}`}
              end={path === '/' || path === '/catalog'}
            >
              <span className="top-nav__icon">
                <Icon />
              </span>
              <span className="top-nav__label">{label}</span>
            </NavLink>
          );
        })}
      </LiquidGlassCard>
    </nav>
  );
}
