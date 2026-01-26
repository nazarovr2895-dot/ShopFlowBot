import { useState, useEffect } from 'react';
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
  const [metros, setMetros] = useState<Metro[]>([]);
  const [loading, setLoading] = useState(false);

  // Load cities on mount
  useEffect(() => {
    api.getCities().then(setCities).catch(console.error);
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
    setMetros([]);
  }, [filters.city_id]);

  // Load metros when district changes
  useEffect(() => {
    if (filters.district_id) {
      setLoading(true);
      api
        .getMetroStations(filters.district_id)
        .then(setMetros)
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setMetros([]);
    }
  }, [filters.district_id]);

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

  const handleMetroChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    hapticFeedback('light');
    const metroId = e.target.value ? parseInt(e.target.value) : undefined;
    onFiltersChange({
      ...filters,
      metro_id: metroId,
    });
  };

  const handleDeliveryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    hapticFeedback('light');
    const deliveryType = e.target.value as SellerFilters['delivery_type'] | '';
    onFiltersChange({
      ...filters,
      delivery_type: deliveryType || undefined,
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

  const handleReset = () => {
    hapticFeedback('medium');
    onFiltersChange({});
  };

  const hasFilters =
    filters.city_id ||
    filters.district_id ||
    filters.metro_id ||
    filters.delivery_type ||
    filters.sort_price ||
    filters.sort_mode;

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

      <div className="filters__row">
        <select
          className="filters__select"
          value={filters.city_id || ''}
          onChange={handleCityChange}
        >
          <option value="">Все города</option>
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </select>

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

      <div className="filters__row">
        <select
          className="filters__select"
          value={filters.metro_id || ''}
          onChange={handleMetroChange}
          disabled={!filters.district_id || loading}
        >
          <option value="">Все станции метро</option>
          {metros.map((metro) => (
            <option key={metro.id} value={metro.id}>
              {metro.name}
            </option>
          ))}
        </select>
      </div>

      <div className="filters__row">
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

      {hasFilters && (
        <button className="filters__reset" onClick={handleReset}>
          Сбросить фильтры
        </button>
      )}
    </div>
  );
}
