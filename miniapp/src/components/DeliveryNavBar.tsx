import { LiquidGlassCard } from './LiquidGlassCard';
import { useSystemTheme } from '../hooks/useSystemTheme';
import { isTelegram } from '../utils/environment';
import { useDesktopLayout } from '../hooks/useDesktopLayout';
import './DeliveryNavBar.css';

export type DeliveryTab = 'all' | 'delivery' | 'pickup';

interface DeliveryNavBarProps {
  activeTab: DeliveryTab;
  onTabChange: (tab: DeliveryTab) => void;
}

export function DeliveryNavBar({ activeTab, onTabChange }: DeliveryNavBarProps) {
  const systemTheme = useSystemTheme();
  const isTelegramEnv = isTelegram();
  const isDesktop = useDesktopLayout();

  const oppositeTheme = systemTheme === 'dark' ? 'dark' : 'light';

  // Desktop: clean segmented control (no LiquidGlass floating bar)
  if (isDesktop) {
    return (
      <div className="delivery-nav-desktop">
        <button
          type="button"
          className={`delivery-nav-desktop__tab ${activeTab === 'all' ? 'delivery-nav-desktop__tab--active' : ''}`}
          onClick={() => onTabChange('all')}
        >
          Все
        </button>
        <button
          type="button"
          className={`delivery-nav-desktop__tab ${activeTab === 'delivery' ? 'delivery-nav-desktop__tab--active' : ''}`}
          onClick={() => onTabChange('delivery')}
        >
          <svg className="delivery-nav-desktop__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="15" height="13" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
          Доставка
        </button>
        <button
          type="button"
          className={`delivery-nav-desktop__tab ${activeTab === 'pickup' ? 'delivery-nav-desktop__tab--active' : ''}`}
          onClick={() => onTabChange('pickup')}
        >
          <svg className="delivery-nav-desktop__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
          Самовывоз
        </button>
      </div>
    );
  }

  // Mobile: LiquidGlass floating pill
  return (
    <nav
      className={`delivery-nav-bar ${isTelegramEnv ? 'delivery-nav-bar--telegram' : ''}`}
      data-telegram={isTelegramEnv}
      data-theme-opposite={oppositeTheme}
    >
      <LiquidGlassCard className="delivery-nav-bar__container">
        <button
          type="button"
          className={`delivery-nav-bar__tab ${activeTab === 'all' ? 'delivery-nav-bar__tab--active' : ''}`}
          onClick={() => onTabChange('all')}
          aria-label="Все"
          aria-pressed={activeTab === 'all'}
        >
          <span className="delivery-nav-bar__tab-text">Все</span>
        </button>
        <button
          type="button"
          className={`delivery-nav-bar__tab ${activeTab === 'delivery' ? 'delivery-nav-bar__tab--active' : ''}`}
          onClick={() => onTabChange('delivery')}
          aria-label="Доставка"
          aria-pressed={activeTab === 'delivery'}
        >
          <span className="delivery-nav-bar__tab-text">Доставка</span>
        </button>
        <button
          type="button"
          className={`delivery-nav-bar__tab ${activeTab === 'pickup' ? 'delivery-nav-bar__tab--active' : ''}`}
          onClick={() => onTabChange('pickup')}
          aria-label="Самовывоз"
          aria-pressed={activeTab === 'pickup'}
        >
          <span className="delivery-nav-bar__tab-text">Самовывоз</span>
        </button>
      </LiquidGlassCard>
    </nav>
  );
}
