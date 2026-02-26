import { useState, useCallback, useRef, useEffect } from 'react';
import { loadYmaps, getYmapsApiKey, type YmapsComponents } from '../lib/ymaps';
import './LocationPicker.css';

interface Props {
  /** Initial center [lon, lat]. Defaults to Moscow. */
  initialCenter?: [number, number];
  onConfirm: (lat: number, lon: number) => void;
  onClose: () => void;
}

// Moscow center fallback
const DEFAULT_CENTER: [number, number] = [37.6173, 55.7558];

export function LocationPicker({ initialCenter, onConfirm, onClose }: Props) {
  const [ymaps, setYmaps] = useState<YmapsComponents | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const centerRef = useRef<[number, number]>(initialCenter || DEFAULT_CENTER);
  const [coords, setCoords] = useState<{ lat: number; lon: number }>(() => {
    const c = initialCenter || DEFAULT_CENTER;
    return { lat: c[1], lon: c[0] };
  });

  useEffect(() => {
    const key = getYmapsApiKey();
    if (!key) {
      setErrorMsg('API ключ Яндекс Карт не найден. Проверьте config.json (ymapsApiKey).');
      return;
    }
    loadYmaps()
      .then(setYmaps)
      .catch((err) => setErrorMsg(err?.message || 'Ошибка загрузки SDK'));
  }, []);

  const handleUpdate = useCallback((event: { location: { center: [number, number] } }) => {
    const [lon, lat] = event.location.center;
    centerRef.current = [lon, lat];
    setCoords({ lat, lon });
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(coords.lat, coords.lon);
  }, [coords, onConfirm]);

  if (errorMsg) {
    return (
      <div className="location-picker__overlay" onClick={onClose}>
        <div className="location-picker__modal" onClick={(e) => e.stopPropagation()}>
          <div className="location-picker__error">
            <p>Не удалось загрузить карту</p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', maxWidth: 400 }}>{errorMsg}</p>
            <button className="btn btn-ghost" onClick={onClose}>Закрыть</button>
          </div>
        </div>
      </div>
    );
  }

  if (!ymaps) {
    return (
      <div className="location-picker__overlay">
        <div className="location-picker__modal">
          <div className="location-picker__loading">
            <div className="location-picker__spinner" />
            <span>Загрузка карты...</span>
          </div>
        </div>
      </div>
    );
  }

  const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapListener, YMapControls, YMapZoomControl, reactify } = ymaps;

  const center = initialCenter || DEFAULT_CENTER;
  const zoom = initialCenter ? 16 : 11;

  return (
    <div className="location-picker__overlay" onClick={onClose}>
      <div className="location-picker__modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="location-picker__header">
          <h3 className="location-picker__title">Укажите местоположение</h3>
          <button className="location-picker__close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Map */}
        <div className="location-picker__map-container">
          <YMap
            location={reactify.useDefault({ center, zoom })}
            mode="vector"
          >
            <YMapDefaultSchemeLayer theme="light" />
            <YMapDefaultFeaturesLayer />
            <YMapControls position="right">
              <YMapZoomControl />
            </YMapControls>
            <YMapListener
              onUpdate={handleUpdate}
              onActionStart={() => setIsDragging(true)}
              onActionEnd={() => setIsDragging(false)}
            />
          </YMap>

          {/* Center pin — fixed in the middle of the map */}
          <div className={`location-picker__pin ${isDragging ? 'location-picker__pin--dragging' : ''}`}>
            <svg width="36" height="48" viewBox="0 0 36 48" fill="none">
              <path
                d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30s18-16.5 18-30C36 8.06 27.94 0 18 0z"
                fill="#6366f1"
              />
              <circle cx="18" cy="18" r="7" fill="#fff" />
            </svg>
          </div>
        </div>

        {/* Bottom bar with coordinates + confirm button */}
        <div className="location-picker__bar">
          <div className="location-picker__coords">
            <span className="location-picker__coords-label">Координаты:</span>
            <span className="location-picker__coords-value">
              {coords.lat.toFixed(6)}, {coords.lon.toFixed(6)}
            </span>
          </div>
          <div className="location-picker__actions">
            <button className="btn btn-ghost" onClick={onClose}>
              Отмена
            </button>
            <button className="btn btn-primary" onClick={handleConfirm}>
              Подтвердить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
