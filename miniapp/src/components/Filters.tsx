import { useState, useEffect, useRef, useCallback } from 'react';
import type { City, District, Metro, SellerFilters } from '../types';
import { api } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import './Filters.css';

interface FiltersProps {
  filters: SellerFilters;
  onApply: (filters: SellerFilters) => void;
  onClose?: () => void;
  layout?: 'mobile' | 'browser';
}

export function Filters({ filters, onApply, onClose, layout = 'mobile' }: FiltersProps) {
  const { hapticFeedback } = useTelegramWebApp();

  const [localFilters, setLocalFilters] = useState<SellerFilters>(filters);
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

  // Sync local state when external filters change (e.g. chip removal while modal closed)
  useEffect(() => {
    setLocalFilters(filters);
    setPriceMinInput(filters.price_min?.toString() ?? '');
    setPriceMaxInput(filters.price_max?.toString() ?? '');
  }, [filters]);

  // Load cities on mount; auto-select first city if none chosen
  useEffect(() => {
    api.getCities().then((data) => {
      setCities(data);
      if (!localFilters.city_id && data.length > 0) {
        setLocalFilters(prev => ({ ...prev, city_id: data[0].id }));
      }
    }).catch(console.error);
  }, []);

  // Load districts when city changes
  useEffect(() => {
    if (localFilters.city_id) {
      setLoading(true);
      api
        .getDistricts(localFilters.city_id)
        .then(setDistricts)
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setDistricts([]);
    }
  }, [localFilters.city_id]);

  // Clear metro search when metro filter is cleared
  useEffect(() => {
    if (!localFilters.metro_id) {
      setMetroSearchQuery('');
    }
  }, [localFilters.metro_id]);

  // Debounced metro search
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
    setLocalFilters(prev => ({
      ...prev,
      city_id: cityId,
      district_id: undefined,
      metro_id: undefined,
    }));
  };

  const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    hapticFeedback('light');
    const districtId = e.target.value ? parseInt(e.target.value) : undefined;
    setLocalFilters(prev => ({
      ...prev,
      district_id: districtId,
      metro_id: undefined,
    }));
  };

  const handleMetroSelect = useCallback(
    (metro: Metro) => {
      hapticFeedback('light');
      setMetroSearchQuery(metro.name);
      setMetroDropdownOpen(false);
      setLocalFilters(prev => ({
        ...prev,
        metro_id: metro.id,
      }));
    },
    [hapticFeedback]
  );

  const handleMetroClear = useCallback(() => {
    hapticFeedback('light');
    setMetroSearchQuery('');
    setMetroDropdownOpen(false);
    setLocalFilters(prev => ({
      ...prev,
      metro_id: undefined,
    }));
  }, [hapticFeedback]);

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    hapticFeedback('light');
    const sortPrice = e.target.value as SellerFilters['sort_price'] | '';
    setLocalFilters(prev => ({
      ...prev,
      sort_price: sortPrice || undefined,
    }));
  };

  const handleFreeDeliveryTab = (value: boolean) => {
    hapticFeedback('light');
    setLocalFilters(prev => ({
      ...prev,
      free_delivery: prev.free_delivery === value ? undefined : value,
    }));
  };

  const handleReset = () => {
    hapticFeedback('medium');
    setLocalFilters({});
    setPriceMinInput('');
    setPriceMaxInput('');
  };

  const handleApply = () => {
    hapticFeedback('medium');
    const min = priceMinInput ? parseInt(priceMinInput) : undefined;
    const max = priceMaxInput ? parseInt(priceMaxInput) : undefined;
    onApply({ ...localFilters, price_min: min, price_max: max });
    onClose?.();
  };

  const hasFilters =
    localFilters.city_id ||
    localFilters.district_id ||
    localFilters.metro_id ||
    localFilters.free_delivery !== undefined ||
    localFilters.sort_price ||
    localFilters.price_min ||
    localFilters.price_max ||
    priceMinInput ||
    priceMaxInput;

  const isBrowser = layout === 'browser';

  return (
    <div className={`filters ${isBrowser ? 'filters--browser' : ''}`}>
      {/* Delivery cost tabs */}
      <div className="filters__delivery-tabs">
        <button
          className={`filters__delivery-tab ${localFilters.free_delivery === false ? 'active' : ''}`}
          onClick={() => handleFreeDeliveryTab(false)}
        >
          Платно
        </button>
        <button
          className={`filters__delivery-tab ${localFilters.free_delivery === true ? 'active' : ''}`}
          onClick={() => handleFreeDeliveryTab(true)}
        >
          Бесплатно
        </button>
      </div>

      {/* City */}
      <div className="filters__item">
        <select
          className="filters__select"
          value={localFilters.city_id || ''}
          onChange={handleCityChange}
        >
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </select>
      </div>

      {/* District */}
      <div className="filters__item">
        <select
          className="filters__select"
          value={localFilters.district_id || ''}
          onChange={handleDistrictChange}
          disabled={!localFilters.city_id || loading}
        >
          <option value="">Все районы</option>
          {districts.map((district) => (
            <option key={district.id} value={district.id}>
              {district.name}
            </option>
          ))}
        </select>
      </div>

      {/* Metro search */}
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
          {localFilters.metro_id && (
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
                  className={`filters__metro-option ${localFilters.metro_id === metro.id ? 'selected' : ''}`}
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

      {/* Sort */}
      <div className="filters__item">
        <select
          className="filters__select"
          value={localFilters.sort_price || ''}
          onChange={handleSortChange}
        >
          <option value="">По умолчанию</option>
          <option value="asc">Сначала дешевле</option>
          <option value="desc">Сначала дороже</option>
        </select>
      </div>

      {/* Price range */}
      <div className="filters__item">
        {!isBrowser && <div className="filters__label">Цена</div>}
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

      {/* Action buttons */}
      <div className="filters__actions">
        <button
          className="filters__reset-btn"
          onClick={handleReset}
          disabled={!hasFilters}
        >
          Сбросить
        </button>
        <button
          className="filters__apply-btn"
          onClick={handleApply}
        >
          Применить
        </button>
      </div>
    </div>
  );
}
