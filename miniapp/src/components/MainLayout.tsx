import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { TopNav } from './TopNav';
import { CatalogNavBar } from './CatalogNavBar';
import { isTelegram } from '../utils/environment';
import { useDesktopLayout } from '../hooks/useDesktopLayout';
import { useLocationCache } from '../hooks/useLocationCache';
import { useCatalogFilter } from '../contexts/CatalogFilterContext';
import type { SellerFilters } from '../types';
import type { DeliveryTab } from './DeliveryNavBar';
import './MainLayout.css';

export function MainLayout() {
  const isTelegramEnv = isTelegram();
  const isDesktop = useDesktopLayout();
  const { filters, setFilters } = useLocationCache();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { openFilter } = useCatalogFilter();

  const searchValue = filters.search ?? '';
  const onSearchChange = (value: string) => {
    setFilters((prev: SellerFilters) => ({ ...prev, search: value.trim() || undefined }));
  };
  const onSearchSubmit = () => {
    if (pathname !== '/catalog') {
      navigate('/catalog');
    }
  };
  // Exclude delivery_type from badge count (it has its own nav tabs)
  const activeFiltersCount =
    Object.entries(filters).filter(([k, v]) => k !== 'search' && k !== 'delivery_type' && v !== undefined && v !== '').length;

  const isCatalog = pathname === '/catalog';

  // Delivery tab — synced with filters.delivery_type
  const deliveryTab: DeliveryTab =
    filters.delivery_type === 'delivery' ? 'delivery'
    : filters.delivery_type === 'pickup' ? 'pickup'
    : 'all';

  const handleDeliveryTabChange = (tab: DeliveryTab) => {
    setFilters((prev: SellerFilters) => ({
      ...prev,
      delivery_type: tab === 'all' ? undefined : tab,
    }));
  };

  return (
    <div
      className={`main-layout ${isTelegramEnv ? 'main-layout--telegram' : ''} ${isDesktop ? 'main-layout--desktop' : ''}`}
      data-telegram={isTelegramEnv}
    >
      <TopNav />
      {isDesktop && (
        <CatalogNavBar
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          onFilterClick={openFilter}
          activeFiltersCount={activeFiltersCount}
          showFilterButton={isCatalog}
          desktopLayout
          onSearchSubmit={onSearchSubmit}
          deliveryTab={isCatalog ? deliveryTab : undefined}
          onDeliveryTabChange={isCatalog ? handleDeliveryTabChange : undefined}
        />
      )}
      <main className="main-layout__content">
        <Outlet />
      </main>
    </div>
  );
}
