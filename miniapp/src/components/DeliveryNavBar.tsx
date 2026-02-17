import { LiquidGlassCard } from './LiquidGlassCard';
import { useSystemTheme } from '../hooks/useSystemTheme';
import { isTelegram } from '../utils/environment';
import './DeliveryNavBar.css';

export type DeliveryTab = 'all' | 'delivery' | 'pickup';

interface DeliveryNavBarProps {
  activeTab: DeliveryTab;
  onTabChange: (tab: DeliveryTab) => void;
}

/**
 * Inline delivery type switcher for Telegram Mini App.
 * Scrolls with the page content (not fixed).
 * On desktop, delivery tabs are embedded directly into CatalogNavBar instead.
 */
export function DeliveryNavBar({ activeTab, onTabChange }: DeliveryNavBarProps) {
  const systemTheme = useSystemTheme();
  const isTelegramEnv = isTelegram();

  const oppositeTheme = systemTheme === 'dark' ? 'dark' : 'light';

  return (
    <div
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
    </div>
  );
}
