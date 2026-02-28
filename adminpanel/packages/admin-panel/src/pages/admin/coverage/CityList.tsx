import { Trash2, Plus } from 'lucide-react';
import { useToast, useConfirm, Skeleton } from '@shared/components/ui';
import { deleteCoverageCity, type CoverageCity } from '../../../api/adminClient';

interface CityListProps {
  cities: CoverageCity[];
  loading: boolean;
  selectedCityId: number | null;
  onSelect: (cityId: number | null) => void;
  onAddCity: () => void;
  onReload: () => Promise<void>;
}

export function CityList({ cities, loading, selectedCityId, onSelect, onAddCity, onReload }: CityListProps) {
  const toast = useToast();
  const confirm = useConfirm();

  const handleDelete = async (e: React.MouseEvent, city: CoverageCity) => {
    e.stopPropagation();
    const ok = await confirm({
      title: `Удалить "${city.name}"?`,
      message: 'Будут удалены все районы и станции метро этого города. Действие необратимо.',
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteCoverageCity(city.id);
      toast.success(`Город "${city.name}" удалён`);
      if (selectedCityId === city.id) onSelect(null);
      await onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка удаления');
    }
  };

  if (loading) {
    return (
      <div className="cov-cities">
        <div className="cov-cities__header">
          <span className="cov-cities__title">Города</span>
        </div>
        {[1, 2, 3].map(i => <Skeleton key={i} height="56px" />)}
      </div>
    );
  }

  return (
    <div className="cov-cities">
      <div className="cov-cities__header">
        <span className="cov-cities__title">Города</span>
        <button className="btn btn-primary btn-sm" onClick={onAddCity}>
          <Plus size={14} /> Добавить
        </button>
      </div>

      {cities.length === 0 && (
        <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--space-6) 0' }}>
          Нет добавленных городов
        </p>
      )}

      {cities.map(city => (
        <div
          key={city.id}
          className={`cov-city-card ${selectedCityId === city.id ? 'cov-city-card--selected' : ''}`}
          onClick={() => onSelect(city.id)}
        >
          <div className="cov-city-card__info">
            <div className="cov-city-card__name">{city.name}</div>
            <div className="cov-city-card__meta">
              <span>{city.districts_count} р-нов</span>
              <span>{city.metro_count} метро</span>
              <span>{city.sellers_count} прод.</span>
            </div>
          </div>
          {city.sellers_count === 0 && (
            <button
              className="cov-city-card__delete btn btn-ghost btn-sm"
              onClick={(e) => handleDelete(e, city)}
              title="Удалить город"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
