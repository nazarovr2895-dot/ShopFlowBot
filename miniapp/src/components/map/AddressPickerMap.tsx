import { useState, useCallback, useRef } from 'react';
import { useYmaps } from './YandexMapProvider';
import { api } from '../../api/client';
import './Map.css';

interface Props {
  initialCenter?: [number, number]; // [lon, lat]
  cityKladrId?: string;
  onSelect: (address: string, lat: number, lon: number) => void;
  onClose: () => void;
}

// Moscow center fallback
const DEFAULT_CENTER: [number, number] = [37.6173, 55.7558];

export function AddressPickerMap({ initialCenter, cityKladrId, onSelect }: Props) {
  const ymaps = useYmaps();
  const [address, setAddress] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const centerRef = useRef<[number, number]>(initialCenter || DEFAULT_CENTER);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const reverseGeocode = useCallback(async (lon: number, lat: number) => {
    setLoading(true);
    try {
      const suggestions = await api.suggestAddress(
        `${lat}, ${lon}`,
        cityKladrId,
      );
      if (suggestions.length > 0) {
        setAddress(suggestions[0].value);
      } else {
        setAddress(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
      }
    } catch {
      setAddress(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
    } finally {
      setLoading(false);
    }
  }, [cityKladrId]);

  const handleUpdate = useCallback((event: { location: { center: [number, number] } }) => {
    const [lon, lat] = event.location.center;
    centerRef.current = [lon, lat];

    // Debounce reverse geocode
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      reverseGeocode(lon, lat);
    }, 500);
  }, [reverseGeocode]);

  const handleConfirm = useCallback(() => {
    const [lon, lat] = centerRef.current;
    onSelect(address, lat, lon);
  }, [address, onSelect]);

  if (!ymaps) return null;

  const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapListener, YMapControls, YMapZoomControl, reactify } = ymaps;

  const center = initialCenter || DEFAULT_CENTER;

  return (
    <div className="address-picker" style={{ height: '100%' }}>
      <div style={{ width: '100%', height: '100%' }}>
        <YMap
          location={reactify.useDefault({ center, zoom: 16 })}
          mode="vector"
        >
          <YMapDefaultSchemeLayer />
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
      </div>

      {/* Center pin (stays fixed in the middle) */}
      <div className={`address-picker__pin ${isDragging ? 'address-picker__pin--dragging' : ''}`}>
        <svg width="36" height="48" viewBox="0 0 36 48" fill="none">
          <path
            d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30s18-16.5 18-30C36 8.06 27.94 0 18 0z"
            fill="#3390ec"
          />
          <circle cx="18" cy="18" r="7" fill="#fff" />
        </svg>
      </div>

      {/* Bottom bar with address + confirm */}
      <div className="address-picker__bar">
        <div className="address-picker__address">
          {loading ? 'Определяем адрес...' : (address || 'Переместите карту')}
        </div>
        <button
          className="address-picker__btn"
          disabled={!address || loading}
          onClick={handleConfirm}
        >
          Подтвердить адрес
        </button>
      </div>
    </div>
  );
}
