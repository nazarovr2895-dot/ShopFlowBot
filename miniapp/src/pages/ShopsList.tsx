import { useState, useEffect, useCallback } from 'react';
import type { PublicSellerListItem, SellerFilters } from '../types';
import { api } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { ShopCard, Filters, Loader, EmptyState } from '../components';
import './ShopsList.css';

// Cache for filters to persist between navigations
let cachedFilters: SellerFilters = {};

export function ShopsList() {
  const { setBackButton, hideMainButton } = useTelegramWebApp();
  
  const [sellers, setSellers] = useState<PublicSellerListItem[]>([]);
  const [filters, setFilters] = useState<SellerFilters>(cachedFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

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

  // Initial load and reload on filter change
  useEffect(() => {
    setPage(1);
    loadSellers(1);
    cachedFilters = filters; // Save filters to cache
  }, [filters, loadSellers]);

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

  const activeFiltersCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="shops-list">
      <header className="shops-list__header">
        <h1 className="shops-list__title">FlowShop</h1>
        <button 
          className={`shops-list__filter-toggle ${activeFiltersCount > 0 ? 'active' : ''}`}
          onClick={toggleFilters}
        >
          Фильтры
          {activeFiltersCount > 0 && (
            <span className="shops-list__filter-badge">{activeFiltersCount}</span>
          )}
        </button>
      </header>

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
          icon="🏪"
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
