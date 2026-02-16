import { LiquidGlassCard } from './LiquidGlassCard';
import { useSystemTheme } from '../hooks/useSystemTheme';
import { isTelegram } from '../utils/environment';
import { useDesktopLayout } from '../hooks/useDesktopLayout';
import './MyFlowersNavBar.css';

type TabType = 'flowers' | 'orders';

interface MyFlowersNavBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export function MyFlowersNavBar({ activeTab, onTabChange }: MyFlowersNavBarProps) {
  const systemTheme = useSystemTheme();
  const isTelegramEnv = isTelegram();
  const isDesktop = useDesktopLayout();

  // Calculate theme for the panel based on system theme
  // System dark → panel uses dark styles (white text)
  // System light → panel uses light styles (black text)
  const oppositeTheme = systemTheme === 'dark' ? 'dark' : 'light';

  return (
    <nav
      className={`my-flowers-nav-bar ${isTelegramEnv ? 'my-flowers-nav-bar--telegram' : ''} ${isDesktop ? 'my-flowers-nav-bar--desktop' : ''}`}
      data-telegram={isTelegramEnv}
      data-theme-opposite={oppositeTheme}
    >
      <LiquidGlassCard className="my-flowers-nav-bar__container">
        <button
          className={`my-flowers-nav-bar__tab ${activeTab === 'flowers' ? 'my-flowers-nav-bar__tab--active' : ''}`}
          onClick={() => onTabChange('flowers')}
          aria-label="Подписки"
          aria-pressed={activeTab === 'flowers'}
        >
          <span className="my-flowers-nav-bar__tab-text">Подписки</span>
        </button>
        <button
          className={`my-flowers-nav-bar__tab ${activeTab === 'orders' ? 'my-flowers-nav-bar__tab--active' : ''}`}
          onClick={() => onTabChange('orders')}
          aria-label="Мои заказы"
          aria-pressed={activeTab === 'orders'}
        >
          <span className="my-flowers-nav-bar__tab-text">Мои заказы</span>
        </button>
      </LiquidGlassCard>
    </nav>
  );
}
