import { useState, useEffect, useRef, useCallback } from 'react';
import type { City, District, Metro, SellerFilters } from '../types';
import { api } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import './Filters.css';

interface FiltersProps {
  filters: SellerFilters;
  onFiltersChange: (filters: SellerFilters) => void;
}

export function Filters({ filters, onFiltersChange }: FiltersProps) {
  const { hapticFeedback } = useTelegramWebApp();
  
  const [cities, setCities] = useState<City[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(false);
  const [metroSearchQuery, setMetroSearchQuery] = useState('');
  const [metroSearchResults, setMetroSearchResults] = useState<Metro[]>([]);
  const [metroSearching, setMetroSearching] = useState(false);
  const [metroDropdownOpen, setMetroDropdownOpen] = useState(false);
  const metroSearchRef = useRef<HTMLDivElement>(null);
  const [priceMinInput, setPriceMinInput] = useState(filters.price_min?.toString() ?? '');
  const [priceMaxInput, setPriceMaxInput] = useState(filters.price_max?.toString() ?? '');
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Load cities on mount; auto-select first city if none chosen
  useEffect(() => {
    api.getCities().then((data) => {
      setCities(data);
      if (!filters.city_id && data.length > 0) {
        onFiltersChange({ ...filters, city_id: data[0].id });
      }
    }).catch(console.error);
  }, []);

  // Load districts when city changes
  useEffect(() => {
    if (filters.city_id) {
      setLoading(true);
      api
        .getDistricts(filters.city_id)
        .then(setDistricts)
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setDistricts([]);
    }
  }, [filters.city_id]);

  // Clear metro search when metro filter is cleared (e.g. reset, district change)
  useEffect(() => {
    if (!filters.metro_id) {
      setMetroSearchQuery('');
    }
  }, [filters.metro_id]);

  // Debounced metro search (search across all stations)
  useEffect(() => {
    if (metroSearchQuery.trim().length < 2) {
      setMetroSearchResults([]);
      setMetroDropdownOpen(metroSearchQuery.length > 0);
      return;
    }
    const timer = setTimeout(() => {
      setMetroSearching(true);
      api
        .searchMetroStations(metroSearchQuery.trim())
        .then((results) => {
          setMetroSearchResults(results);
          setMetroDropdownOpen(true);
        })
        .catch(console.error)
        .finally(() => setMetroSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [metroSearchQuery]);

  // Sync price inputs when filters change externally (e.g. reset)
  useEffect(() => {
    setPriceMinInput(filters.price_min?.toString() ?? '');
    setPriceMaxInput(filters.price_max?.toString() ?? '');
  }, [filters.price_min, filters.price_max]);

  // Debounced price filter application (use ref to avoid stale closure)
  useEffect(() => {
    const timer = setTimeout(() => {
      const min = priceMinInput ? parseInt(priceMinInput) : undefined;
      const max = priceMaxInput ? parseInt(priceMaxInput) : undefined;
      const current = filtersRef.current;
      if (min !== current.price_min || max !== current.price_max) {
        onFiltersChange({ ...current, price_min: min, price_max: max });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [priceMinInput, priceMaxInput, onFiltersChange]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (metroSearchRef.current && !metroSearchRef.current.contains(e.target as Node)) {
        setMetroDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    hapticFeedback('light');
    const cityId = e.target.value ? parseInt(e.target.value) : undefined;
    onFiltersChange({
      ...filters,
      city_id: cityId,
      district_id: undefined,
      metro_id: undefined,
    });
  };

  const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    hapticFeedback('light');
    const districtId = e.target.value ? parseInt(e.target.value) : undefined;
    onFiltersChange({
      ...filters,
      district_id: districtId,
      metro_id: undefined,
    });
  };

  const handleMetroSelect = useCallback(
    (metro: Metro) => {
      hapticFeedback('light');
      setMetroSearchQuery(metro.name);
      setMetroDropdownOpen(false);
      onFiltersChange({
        ...filters,
        metro_id: metro.id,
      });
    },
    [filters, hapticFeedback, onFiltersChange]
  );

  const handleMetroClear = useCallback(() => {
    hapticFeedback('light');
    setMetroSearchQuery('');
    setMetroDropdownOpen(false);
    onFiltersChange({
      ...filters,
      metro_id: undefined,
    });
  }, [filters, hapticFeedback, onFiltersChange]);

  const handleDeliveryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    hapticFeedback('light');
    const deliveryType = e.target.value as SellerFilters['delivery_type'] | '';
    onFiltersChange({
      ...filters,
      delivery_type: deliveryType || undefined,
    });
  };

  const handleFreeDeliveryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    hapticFeedback('light');
    const freeDelivery = e.target.value === '' ? undefined : e.target.value === 'true';
    onFiltersChange({
      ...filters,
      free_delivery: freeDelivery,
    });
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    hapticFeedback('light');
    const sortPrice = e.target.value as SellerFilters['sort_price'] | '';
    onFiltersChange({
      ...filters,
      sort_price: sortPrice || undefined,
      // Clear sort_mode when using price sorting
      sort_mode: sortPrice ? undefined : filters.sort_mode,
    });
  };

  const handleSortModeChange = (mode: SellerFilters['sort_mode']) => {
    hapticFeedback('light');
    onFiltersChange({
      ...filters,
      sort_mode: mode,
      // Clear sort_price when changing mode (modes use random sorting)
      sort_price: undefined,
    });
  };

  const handleToggle = (key: 'only_available' | 'has_preorder' | 'show_closed') => {
    hapticFeedback('light');
    onFiltersChange({
      ...filters,
      [key]: filters[key] ? undefined : true,
    });
  };

  const handleReset = () => {
    hapticFeedback('medium');
    onFiltersChange({});
  };

  const hasFilters =
    filters.city_id ||
    filters.district_id ||
    filters.metro_id ||
    filters.delivery_type ||
    filters.free_delivery !== undefined ||
    filters.sort_price ||
    filters.sort_mode ||
    filters.price_min ||
    filters.price_max ||
    filters.only_available ||
    filters.has_preorder ||
    filters.show_closed;

  return (
    <div className="filters">
      {/* Sort mode toggle */}
      <div className="filters__mode-toggle">
        <button
          className={`filters__mode-btn ${!filters.sort_mode || filters.sort_mode === 'all_city' ? 'active' : ''}`}
          onClick={() => handleSortModeChange('all_city')}
        >
          Все магазины
        </button>
        <button
          className={`filters__mode-btn ${filters.sort_mode === 'nearby' ? 'active' : ''}`}
          onClick={() => handleSortModeChange('nearby')}
        >
          По близости
        </button>
      </div>

      {filters.sort_mode === 'nearby' && !filters.district_id && (
        <div className="filters__hint">
          Выберите район для отображения ближайших магазинов
        </div>
      )}

      <div className="filters__item">
        <select
          className="filters__select"
          value={filters.city_id || ''}
          onChange={handleCityChange}
        >
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </select>
      </div>

      <div className="filters__item">
        <select
          className="filters__select"
          value={filters.district_id || ''}
          onChange={handleDistrictChange}
          disabled={!filters.city_id || loading}
        >
          <option value="">Все районы</option>
          {districts.map((district) => (
            <option key={district.id} value={district.id}>
              {district.name}
            </option>
          ))}
        </select>
      </div>

      <div className="filters__item filters__metro-search" ref={metroSearchRef}>
        <div className="filters__metro-input-wrap">
          <input
            type="text"
            className="filters__metro-input"
            placeholder="Поиск станции метро..."
            value={metroSearchQuery}
            onChange={(e) => setMetroSearchQuery(e.target.value)}
            onFocus={() => metroSearchResults.length > 0 && setMetroDropdownOpen(true)}
          />
          {filters.metro_id && (
            <button
              type="button"
              className="filters__metro-clear"
              onClick={handleMetroClear}
              aria-label="Очистить метро"
            >
              ×
            </button>
          )}
        </div>
        {metroDropdownOpen && (
          <div className="filters__metro-dropdown">
            {metroSearchQuery.trim().length < 2 ? (
              <div className="filters__metro-hint">Введите минимум 2 символа</div>
            ) : metroSearching ? (
              <div className="filters__metro-hint">Поиск...</div>
            ) : metroSearchResults.length === 0 ? (
              <div className="filters__metro-hint">Станции не найдены</div>
            ) : (
              metroSearchResults.map((metro) => (
                <button
                  key={metro.id}
                  type="button"
                  className={`filters__metro-option ${filters.metro_id === metro.id ? 'selected' : ''}`}
                  onClick={() => handleMetroSelect(metro)}
                >
                  <span
                    className="filters__metro-line-color"
                    style={{ backgroundColor: metro.line_color || '#999' }}
                    aria-hidden
                  />
                  {metro.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="filters__item">
        <select
          className="filters__select"
          value={filters.delivery_type || ''}
          onChange={handleDeliveryChange}
        >
          <option value="">Любой тип</option>
          <option value="delivery">Доставка</option>
          <option value="pickup">Самовывоз</option>
          <option value="both">Доставка и самовывоз</option>
        </select>
      </div>

      <div className="filters__item">
        <select
          className="filters__select"
          value={filters.free_delivery === undefined ? '' : filters.free_delivery.toString()}
          onChange={handleFreeDeliveryChange}
        >
          <option value="">Любая доставка</option>
          <option value="true">Бесплатная доставка</option>
          <option value="false">Платная доставка</option>
        </select>
      </div>

      <div className="filters__item">
        <select
          className="filters__select"
          value={filters.sort_price || ''}
          onChange={handleSortChange}
        >
          <option value="">По умолчанию</option>
          <option value="asc">Сначала дешевле</option>
          <option value="desc">Сначала дороже</option>
        </select>
      </div>

      {/* Price range */}
      <div className="filters__item">
        <div className="filters__label">Цена</div>
        <div className="filters__row">
          <input
            type="number"
            className="filters__price-input"
            placeholder="От"
            min="0"
            value={priceMinInput}
            onChange={(e) => setPriceMinInput(e.target.value)}
          />
          <input
            type="number"
            className="filters__price-input"
            placeholder="До"
            min="0"
            value={priceMaxInput}
            onChange={(e) => setPriceMaxInput(e.target.value)}
          />
        </div>
      </div>

      {/* Toggle filters */}
      <div className="filters__toggles">
        <button
          type="button"
          className={`filters__toggle ${filters.only_available ? 'active' : ''}`}
          onClick={() => handleToggle('only_available')}
        >
          <span className="filters__toggle-check">{filters.only_available ? '✓' : ''}</span>
          Только доступные
        </button>
        <button
          type="button"
          className={`filters__toggle ${filters.has_preorder ? 'active' : ''}`}
          onClick={() => handleToggle('has_preorder')}
        >
          <span className="filters__toggle-check">{filters.has_preorder ? '✓' : ''}</span>
          С предзаказом
        </button>
        <button
          type="button"
          className={`filters__toggle ${filters.show_closed ? 'active' : ''}`}
          onClick={() => handleToggle('show_closed')}
        >
          <span className="filters__toggle-check">{filters.show_closed ? '✓' : ''}</span>
          Показать закрытые
        </button>
      </div>

      {hasFilters && (
        <button className="filters__reset" onClick={handleReset}>
          Сбросить фильтры
        </button>
      )}
    </div>
  );
}
