import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PublicSellerListItem, SellerFilters, District, MetroGeoItem } from '../types';
import { api } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { useLocationCache } from '../hooks/useLocationCache';
import { useDesktopLayout } from '../hooks/useDesktopLayout';
import { useCatalogFilter } from '../contexts/CatalogFilterContext';
import { isTelegram, isBrowser } from '../utils/environment';
import { ShopCard, Loader, EmptyState, CatalogNavBar, FilterModal, BrowserFilterPanel } from '../components';
import type { DeliveryTab } from '../components';
import './ShopsList.css';

const SEARCH_DEBOUNCE_MS = 400;

export function ShopsList() {
  const navigate = useNavigate();
  const { setBackButton, hideMainButton } = useTelegramWebApp();
  const { filters, setFilters, isInitialized } = useLocationCache();
  const isTelegramEnv = isTelegram();
  const isBrowserEnv = isBrowser();
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
  const [districts, setDistricts] = useState<District[]>([]);
  const [metros, setMetros] = useState<MetroGeoItem[]>([]);

  // Hide back button and main button on this page
  useEffect(() => {
    setBackButton(false);
    hideMainButton();
  }, [setBackButton, hideMainButton]);

  // Load districts/metros for filter chip labels
  useEffect(() => {
    if (filters.city_id) {
      api.getDistricts(filters.city_id).then(setDistricts).catch(() => {});
    }
  }, [filters.city_id]);

  useEffect(() => {
    if (filters.metro_id && filters.city_id) {
      api.getMetroStationsByCity(filters.city_id).then(setMetros).catch(() => {});
    }
  }, [filters.metro_id, filters.city_id]);

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

  const handleFiltersApply = (newFilters: SellerFilters) => {
    setFilters(() => newFilters);
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

  // Build filter chips for quick removal
  const filterChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    const removeFilter = (key: keyof SellerFilters) => {
      setFilters((prev: SellerFilters) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    };

    if (filters.district_id) {
      const name = districts.find(d => d.id === filters.district_id)?.name;
      chips.push({ key: 'district_id', label: name || 'Район', onRemove: () => removeFilter('district_id') });
    }
    if (filters.metro_id) {
      const name = metros.find(m => m.id === filters.metro_id)?.name;
      chips.push({ key: 'metro_id', label: name || 'Метро', onRemove: () => removeFilter('metro_id') });
    }
    if (filters.free_delivery !== undefined) {
      chips.push({
        key: 'free_delivery',
        label: filters.free_delivery ? 'Бесплатная доставка' : 'Платная доставка',
        onRemove: () => removeFilter('free_delivery'),
      });
    }
    if (filters.sort_price) {
      chips.push({
        key: 'sort_price',
        label: filters.sort_price === 'asc' ? 'Сначала дешевле' : 'Сначала дороже',
        onRemove: () => removeFilter('sort_price'),
      });
    }
    if (filters.price_min) {
      chips.push({ key: 'price_min', label: `От ${filters.price_min} ₽`, onRemove: () => removeFilter('price_min') });
    }
    if (filters.price_max) {
      chips.push({ key: 'price_max', label: `До ${filters.price_max} ₽`, onRemove: () => removeFilter('price_max') });
    }
    return chips;
  }, [filters, districts, metros, setFilters]);

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

      {/* Telegram / mobile: modal filters */}
      {(isTelegramEnv || !isDesktop) && (
        <FilterModal
          isOpen={isFilterModalOpen}
          onClose={() => setIsFilterModalOpen(false)}
          filters={filters}
          onApply={handleFiltersApply}
        />
      )}

      {/* Browser desktop: inline panel */}
      {isBrowserEnv && isDesktop && (
        <BrowserFilterPanel
          isOpen={isFilterModalOpen}
          filters={filters}
          onApply={(newFilters) => {
            handleFiltersApply(newFilters);
            setIsFilterModalOpen(false);
          }}
        />
      )}

      {filterChips.length > 0 && (
        <div className="shops-list__chips">
          {filterChips.map((chip) => (
            <button
              key={chip.key}
              className="shops-list__chip"
              onClick={chip.onRemove}
            >
              {chip.label}
              <span className="shops-list__chip-remove">×</span>
            </button>
          ))}
        </div>
      )}

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
