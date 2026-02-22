import { NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { LiquidGlassCard } from './LiquidGlassCard';
import { isTelegram } from '../utils/environment';
import { useDesktopLayout } from '../hooks/useDesktopLayout';
import './TopNav.css';

const FlowerIcon = ({ className }: { className?: string }) => (
  <img 
    src="/favicon-32x32.png" 
    alt="Подписки"
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

const PersonIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const OrderListIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
    <path d="M10 9H8" />
  </svg>
);

const tabs = [
  { path: '/', label: 'Подписки', Icon: FlowerIcon },
  { path: '/catalog', label: 'Каталог', Icon: BagIcon },
  { path: '/favorites', label: 'Избранное', Icon: HeartIcon },
  { path: '/profile', label: 'Профиль', Icon: PersonIcon },
] as const;

/** Desktop top nav: all except home link (tabs Подписки/Мои заказы rendered separately) */
const desktopTabs = tabs.filter((t) => t.path !== '/');

export function TopNav() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const pathname = location.pathname;
  const isTelegramEnv = isTelegram();
  const isDesktop = useDesktopLayout();
  const homeTab = searchParams.get('tab') === 'orders' ? 'orders' : 'flowers';

  return (
    <nav
      className={`top-nav ${isTelegramEnv ? 'top-nav--telegram' : ''} ${isDesktop ? 'top-nav--desktop' : ''}`}
      role="navigation"
      data-telegram={isTelegramEnv}
    >
      <LiquidGlassCard className="top-nav__container">
        {isDesktop ? (
          <>
            <div className="top-nav__brand">
              <img
                src="/android-chrome-512x512.png"
                alt=""
                className="top-nav__logo"
                width={40}
                height={40}
              />
              <span className="top-nav__brand-name">flurai</span>
            </div>
            <div className="top-nav__center" aria-hidden />
            <div className="top-nav__right">
              <NavLink
                to="/?tab=flowers"
                className={() => `top-nav__item ${pathname === '/' && homeTab === 'flowers' ? 'top-nav__item--active' : ''}`}
              >
                <span className="top-nav__icon">
                  <FlowerIcon />
                </span>
                <span className="top-nav__label">Подписки</span>
              </NavLink>
              <NavLink
                to="/?tab=orders"
                className={() => `top-nav__item ${pathname === '/' && homeTab === 'orders' ? 'top-nav__item--active' : ''}`}
              >
                <span className="top-nav__icon">
                  <OrderListIcon />
                </span>
                <span className="top-nav__label">Мои заказы</span>
              </NavLink>
              {desktopTabs.map(({ path, label, Icon }) => {
                const isActive = path === '/catalog' ? pathname === '/catalog' : pathname.startsWith(path);
                return (
                  <NavLink
                    key={path}
                    to={path}
                    className={() => `top-nav__item ${isActive ? 'top-nav__item--active' : ''}`}
                    end={path === '/catalog'}
                  >
                    <span className="top-nav__icon">
                      <Icon />
                    </span>
                    <span className="top-nav__label">{label}</span>
                  </NavLink>
                );
              })}
            </div>
          </>
        ) : (
          tabs.map(({ path, label, Icon }) => {
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
          })
        )}
      </LiquidGlassCard>
    </nav>
  );
}
