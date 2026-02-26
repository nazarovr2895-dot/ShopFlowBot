import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PublicSellerListItem, SellerFilters } from '../types';
import { api } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { useLocationCache } from '../hooks/useLocationCache';
import { useDesktopLayout } from '../hooks/useDesktopLayout';
import { useCatalogFilter } from '../contexts/CatalogFilterContext';
import { isTelegram } from '../utils/environment';
import { ShopCard, Loader, EmptyState, CatalogNavBar, FilterModal } from '../components';
import type { DeliveryTab } from '../components';
import './ShopsList.css';

const SEARCH_DEBOUNCE_MS = 400;

export function ShopsList() {
  const navigate = useNavigate();
  const { setBackButton, hideMainButton } = useTelegramWebApp();
  const { filters, setFilters, isInitialized } = useLocationCache();
  const isTelegramEnv = isTelegram();
  const isDesktop = useDesktopLayout();
  const { registerOpenFilter } = useCatalogFilter();
  
  const [sellers, setSellers] = useState<PublicSellerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(() => filters.search ?? '');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hide back button and main button on this page
  useEffect(() => {
    setBackButton(false);
    hideMainButton();
  }, [setBackButton, hideMainButton]);

  // Register open-filter callback for desktop (filter button lives in MainLayout)
  useEffect(() => {
    registerOpenFilter(() => setIsFilterModalOpen(true));
    return () => registerOpenFilter(null);
  }, [registerOpenFilter]);

  // Load sellers
  const loadSellers = useCallback(
    async (pageNum: number, append: boolean = false) => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.getSellers(filters, pageNum, 20);
        
        if (append) {
          setSellers((prev) => [...prev, ...response.sellers]);
        } else {
          setSellers(response.sellers);
        }
        
        setTotal(response.total);
        setHasMore(response.page * response.per_page < response.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  // Sync search input from filters (e.g. when loaded from cache)
  useEffect(() => {
    setSearchInput((prev: string) => (filters.search ?? '') !== prev ? (filters.search ?? '') : prev);
  }, [filters.search]);

  // Debounce search: apply to filters after user stops typing
  const prevSearchInputRef = useRef(searchInput);
  useEffect(() => {
    if (prevSearchInputRef.current === searchInput) return;
    prevSearchInputRef.current = searchInput;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      searchDebounceRef.current = null;
      setFilters((prev: SellerFilters) => ({
        ...prev,
        search: searchInput.trim() || undefined,
      }));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchInput, setFilters]);

  // Initial load and reload on filter change (wait for cache initialization)
  useEffect(() => {
    if (!isInitialized) return;
    setPage(1);
    loadSellers(1);
  }, [filters, loadSellers, isInitialized]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadSellers(nextPage, true);
  };

  const handleFiltersChange = (newFilters: SellerFilters) => {
    setFilters(newFilters);
  };

  // Derive delivery tab from filters (sync two-way)
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

  // Exclude delivery_type from active filters count (since it has its own nav bar)
  const activeFiltersCount = Object.entries(filters).filter(
    ([k, v]) => k !== 'search' && k !== 'delivery_type' && v !== undefined && v !== ''
  ).length;

  return (
    <div className={`shops-list ${isTelegramEnv ? 'shops-list--telegram' : ''}`} data-telegram={isTelegramEnv}>
      {!isDesktop && (
        <CatalogNavBar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          onFilterClick={() => setIsFilterModalOpen(true)}
          activeFiltersCount={activeFiltersCount}
          showFilterButton
          showDeliveryTabsInline
          deliveryTab={deliveryTab}
          onDeliveryTabChange={handleDeliveryTabChange}
        />
      )}

      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />

      <div className="shops-list__content">
          {loading && sellers.length === 0 ? (
            <Loader centered />
          ) : error ? (
            <EmptyState
              title="Ошибка загрузки"
              description={error}
              icon="⚠️"
            />
          ) : sellers.length === 0 ? (
            <EmptyState
              title="Магазины не найдены"
              description="Попробуйте изменить параметры фильтра"
              illustration="shops"
            />
          ) : (
            <>
              <div className="shops-list__info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Найдено: {total} {getShopWord(total)}</span>
                {/* Map button: only on mobile — on desktop it's in CatalogNavBar */}
                {!isDesktop && filters.city_id && (
                  <button
                    onClick={() => navigate(`/map?city_id=${filters.city_id}`)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 10px',
                      border: 'none',
                      borderRadius: 8,
                      background: 'var(--tg-theme-secondary-bg-color, #f0f0f0)',
                      color: 'var(--tg-theme-link-color, #3390ec)',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                      <circle cx="12" cy="9" r="2.5" />
                    </svg>
                    На карте
                  </button>
                )}
              </div>

              <div className="shops-list__grid">
                {sellers.map((seller) => (
                  <ShopCard key={seller.seller_id} seller={seller} />
                ))}
              </div>

              {hasMore && (
                <button
                  className="shops-list__load-more"
                  onClick={handleLoadMore}
                  disabled={loading}
                >
                  {loading ? <Loader size="small" /> : 'Загрузить ещё'}
                </button>
              )}
            </>
          )}
      </div>
    </div>
  );
}

function getShopWord(count: number): string {
  const lastTwo = count % 100;
  const lastOne = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) return 'магазинов';
  if (lastOne === 1) return 'магазин';
  if (lastOne >= 2 && lastOne <= 4) return 'магазина';
  return 'магазинов';
}
