import { useState, useEffect } from 'react';
import type { City, District } from '../types';
import { api } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import './LocationSetup.css';

interface LocationSetupProps {
  onComplete: (cityId: number, districtId?: number) => void;
}

export function LocationSetup({ onComplete }: LocationSetupProps) {
  const { hapticFeedback, setMainButton, hideMainButton } = useTelegramWebApp();
  
  const [cities, setCities] = useState<City[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<number | undefined>();
  const [selectedDistrictId, setSelectedDistrictId] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);

  // Load cities on mount
  useEffect(() => {
    setLoading(true);
    api.getCities()
      .then(setCities)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Load districts when city changes
  useEffect(() => {
    if (selectedCityId) {
      setLoadingDistricts(true);
      setSelectedDistrictId(undefined);
      api.getDistricts(selectedCityId)
        .then(setDistricts)
        .catch(console.error)
        .finally(() => setLoadingDistricts(false));
    } else {
      setDistricts([]);
      setSelectedDistrictId(undefined);
    }
  }, [selectedCityId]);

  // Update main button when selection changes (city required; district optional — "Все округи" = no district)
  useEffect(() => {
    if (selectedCityId) {
      setMainButton(
        'Продолжить',
        () => {
          hapticFeedback('medium');
          if (selectedCityId) {
            onComplete(selectedCityId, selectedDistrictId);
          }
        },
        {
          isVisible: true,
          isActive: true,
        }
      );
    } else {
      hideMainButton();
    }

    // Cleanup on unmount
    return () => {
      hideMainButton();
    };
  }, [selectedCityId, selectedDistrictId, setMainButton, hideMainButton, hapticFeedback, onComplete]);

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    hapticFeedback('light');
    const cityId = e.target.value ? parseInt(e.target.value) : undefined;
    setSelectedCityId(cityId);
  };

  const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    hapticFeedback('light');
    const districtId = e.target.value ? parseInt(e.target.value) : undefined;
    setSelectedDistrictId(districtId);
  };

  return (
    <div className="location-setup">
      <div className="location-setup__content">
        <div className="location-setup__icon">📍</div>
        <h1 className="location-setup__title">Выберите ваш город и район</h1>
        <p className="location-setup__description">
          Это поможет нам показывать вам магазины поблизости
        </p>

        <div className="location-setup__form">
          <div className="location-setup__field">
            <label className="location-setup__label">Город</label>
            <select
              className="location-setup__select"
              value={selectedCityId || ''}
              onChange={handleCityChange}
              disabled={loading}
            >
              <option value="">Выберите город</option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </div>

          <div className="location-setup__field">
            <label className="location-setup__label">Район</label>
            <select
              className="location-setup__select"
              value={selectedDistrictId ?? ''}
              onChange={handleDistrictChange}
              disabled={!selectedCityId || loadingDistricts}
            >
              <option value="">Все округи</option>
              {districts.map((district) => (
                <option key={district.id} value={district.id}>
                  {district.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
