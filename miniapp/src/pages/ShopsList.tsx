import { useState, useEffect, useCallback, useRef } from 'react';
import type { PublicSellerListItem, SellerFilters } from '../types';
import { api } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { useLocationCache } from '../hooks/useLocationCache';
import { ShopCard, Filters, Loader, EmptyState } from '../components';
import './ShopsList.css';

const SEARCH_DEBOUNCE_MS = 400;

export function ShopsList() {
  const { setBackButton, hideMainButton } = useTelegramWebApp();
  const { filters, setFilters, isInitialized } = useLocationCache();
  
  const [sellers, setSellers] = useState<PublicSellerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState(() => filters.search ?? '');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hide back button and main button on this page
  useEffect(() => {
    setBackButton(false);
    hideMainButton();
  }, [setBackButton, hideMainButton]);

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
    setSearchInput((prev) => (filters.search ?? '') !== prev ? (filters.search ?? '') : prev);
  }, [filters.search]);

  // Debounce search: apply to filters after user stops typing
  const prevSearchInputRef = useRef(searchInput);
  useEffect(() => {
    if (prevSearchInputRef.current === searchInput) return;
    prevSearchInputRef.current = searchInput;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      searchDebounceRef.current = null;
      setFilters((prev) => ({
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

  const toggleFilters = () => {
    setShowFilters((prev) => !prev);
  };

  const activeFiltersCount = Object.entries(filters).filter(
    ([k, v]) => k !== 'search' && v !== undefined && v !== ''
  ).length;

  return (
    <div className="shops-list">
      <header className="shops-list__header">
        <h1 className="shops-list__title">FlowShop</h1>
        <button 
          className={`shops-list__filter-toggle ${activeFiltersCount > 0 ? 'active' : ''}`}
          onClick={toggleFilters}
        >
          <svg className="shops-list__filter-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
            <circle cx="8" cy="6" r="1.5" fill="currentColor" />
            <circle cx="15" cy="12" r="1.5" fill="currentColor" />
            <circle cx="12" cy="18" r="1.5" fill="currentColor" />
          </svg>
          Фильтры
          {activeFiltersCount > 0 && (
            <span className="shops-list__filter-badge">{activeFiltersCount}</span>
          )}
        </button>
      </header>

      <div className="shops-list__search-wrap">
        <span className="shops-list__search-icon" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </span>
        <input
          type="search"
          className="shops-list__search-input"
          placeholder="Поиск по названию и хештегам (например: 101 роза)"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          autoComplete="off"
        />
      </div>

      {showFilters && (
        <Filters filters={filters} onFiltersChange={handleFiltersChange} />
      )}

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
          <div className="shops-list__info">
            Найдено: {total} {getShopWord(total)}
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
