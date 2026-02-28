import { useState, useEffect, useCallback } from 'react';
import { PageHeader, useToast } from '@shared/components/ui';
import {
  getCoverageCities,
  type CoverageCity,
} from '../../api/adminClient';
import { CityList } from './coverage/CityList';
import { CityDetail } from './coverage/CityDetail';
import { AddCityModal } from './coverage/AddCityModal';
import './AdminCoverage.css';

export function AdminCoverage() {
  const toast = useToast();
  const [cities, setCities] = useState<CoverageCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const [showAddCity, setShowAddCity] = useState(false);

  const loadCities = useCallback(async () => {
    try {
      const data = await getCoverageCities();
      setCities(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка загрузки городов');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadCities();
  }, [loadCities]);

  const selectedCity = cities.find(c => c.id === selectedCityId) || null;

  return (
    <div className="cov-page">
      <PageHeader
        title="Области покрытия"
        subtitle="Города, районы, станции метро"
      />

      <div className="cov-summary">
        <div className="cov-summary__card">
          <span className="cov-summary__value">{cities.length}</span>
          <span className="cov-summary__label">Городов</span>
        </div>
        <div className="cov-summary__card">
          <span className="cov-summary__value">
            {cities.reduce((sum, c) => sum + c.districts_count, 0)}
          </span>
          <span className="cov-summary__label">Районов</span>
        </div>
        <div className="cov-summary__card">
          <span className="cov-summary__value">
            {cities.reduce((sum, c) => sum + c.metro_count, 0)}
          </span>
          <span className="cov-summary__label">Станций метро</span>
        </div>
      </div>

      <div className="cov-layout">
        <div className="cov-layout__list">
          <CityList
            cities={cities}
            loading={loading}
            selectedCityId={selectedCityId}
            onSelect={setSelectedCityId}
            onAddCity={() => setShowAddCity(true)}
            onReload={loadCities}
          />
        </div>

        <div className="cov-layout__detail">
          {selectedCity ? (
            <CityDetail
              city={selectedCity}
              onReload={loadCities}
              onClose={() => setSelectedCityId(null)}
            />
          ) : (
            <div className="cov-empty-detail">
              <span className="cov-empty-detail__text">
                Выберите город для просмотра районов и станций метро
              </span>
            </div>
          )}
        </div>
      </div>

      {showAddCity && (
        <AddCityModal
          onClose={() => setShowAddCity(false)}
          onCreated={(city) => {
            setShowAddCity(false);
            loadCities();
            setSelectedCityId(city.id);
          }}
        />
      )}
    </div>
  );
}
