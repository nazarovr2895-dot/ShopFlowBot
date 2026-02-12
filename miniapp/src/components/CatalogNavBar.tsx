import { useRef } from 'react';
import { LiquidGlassCard } from './LiquidGlassCard';
import { useSystemTheme } from '../hooks/useSystemTheme';
import { isTelegram } from '../utils/environment';
import './CatalogNavBar.css';

interface CatalogNavBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onFilterClick?: () => void;
  activeFiltersCount?: number;
  /** When false or omitted, filter button is hidden (e.g. global search bar on non-catalog pages) */
  showFilterButton?: boolean;
  /** When true, applies desktop position/size (top 90px, left 24px, width 739px, height 50px) */
  desktopLayout?: boolean;
  /** Called on Enter in search input (e.g. to navigate to catalog) */
  onSearchSubmit?: () => void;
}

export function CatalogNavBar({
  searchValue,
  onSearchChange,
  onFilterClick,
  activeFiltersCount = 0,
  showFilterButton = false,
  desktopLayout = false,
  onSearchSubmit,
}: CatalogNavBarProps) {
  const systemTheme = useSystemTheme();
  const isTelegramEnv = isTelegram();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Calculate opposite theme based on system theme
  // System dark → panel light, System light → panel dark
  const oppositeTheme = systemTheme === 'dark' ? 'light' : 'dark';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearchSubmit?.();
    }
  };

  return (
    <nav
      className={`catalog-nav-bar ${isTelegramEnv ? 'catalog-nav-bar--telegram' : ''} ${desktopLayout ? 'catalog-nav-bar--desktop' : ''}`}
      data-telegram={isTelegramEnv}
      data-theme-opposite={oppositeTheme}
    >
      <LiquidGlassCard className="catalog-nav-bar__container">
        <div className="catalog-nav-bar__search-wrap">
          <span className="catalog-nav-bar__search-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            ref={searchInputRef}
            type="search"
            className="catalog-nav-bar__search-input"
            placeholder="Поиск по названию и хештегам (например: 101 роза)"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
        </div>
        {showFilterButton && onFilterClick && (
          <button
            className={`catalog-nav-bar__filter-btn ${activeFiltersCount > 0 ? 'catalog-nav-bar__filter-btn--active' : ''}`}
            onClick={onFilterClick}
            aria-label="Открыть фильтры"
          >
            <svg className="catalog-nav-bar__filter-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
              <circle cx="8" cy="6" r="1.5" fill="currentColor" />
              <circle cx="15" cy="12" r="1.5" fill="currentColor" />
              <circle cx="12" cy="18" r="1.5" fill="currentColor" />
            </svg>
            {activeFiltersCount > 0 && (
              <span className="catalog-nav-bar__filter-badge" aria-label={`${activeFiltersCount} активных фильтров`}>
                {activeFiltersCount}
              </span>
            )}
          </button>
        )}
      </LiquidGlassCard>
    </nav>
  );
}
