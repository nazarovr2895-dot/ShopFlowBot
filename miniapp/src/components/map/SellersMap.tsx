import { useMemo, useRef, useCallback } from 'react';
import { useYmaps } from './YandexMapProvider';
import { SellerMarker } from './SellerMarker';
import type { SellerGeoItem } from '../../types';
import './Map.css';

export interface BBox {
  sw_lat: number;
  sw_lon: number;
  ne_lat: number;
  ne_lon: number;
}

interface Props {
  sellers: SellerGeoItem[];
  onSellerClick: (seller: SellerGeoItem) => void;
  onBoundsChange?: (bbox: BBox) => void;
  height?: number | string;
  initialCenter?: [number, number];
}

// Default center: Moscow
const DEFAULT_CENTER: [number, number] = [37.6173, 55.7558];
const DEFAULT_ZOOM = 11;

export function SellersMap({ sellers, onSellerClick, onBoundsChange, height = '100%', initialCenter }: Props) {
  const ymaps = useYmaps();
  const boundsCallbackRef = useRef(onBoundsChange);
  boundsCallbackRef.current = onBoundsChange;

  const center = useMemo(() => {
    if (initialCenter) return initialCenter;
    const withCoords = sellers.filter(s => s.geo_lat && s.geo_lon);
    if (withCoords.length === 0) return DEFAULT_CENTER;
    const avgLon = withCoords.reduce((sum, s) => sum + s.geo_lon!, 0) / withCoords.length;
    const avgLat = withCoords.reduce((sum, s) => sum + s.geo_lat!, 0) / withCoords.length;
    return [avgLon, avgLat] as [number, number];
  }, [sellers, initialCenter]);

  const handleUpdate = useCallback(({ location }: any) => {
    if (!boundsCallbackRef.current || !location?.bounds) return;
    const [[sw_lon, sw_lat], [ne_lon, ne_lat]] = location.bounds;
    boundsCallbackRef.current({ sw_lat, sw_lon, ne_lat, ne_lon });
  }, []);

  if (!ymaps) return null;

  const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapListener } = ymaps;

  return (
    <div className="map-container" style={{ height }}>
      <YMap
        location={{ center, zoom: DEFAULT_ZOOM }}
        mode="vector"
      >
        <YMapDefaultSchemeLayer />
        <YMapDefaultFeaturesLayer />
        {onBoundsChange && <YMapListener onUpdate={handleUpdate} />}
        {sellers
          .filter(s => s.geo_lat && s.geo_lon)
          .map(seller => (
            <SellerMarker
              key={seller.seller_id}
              seller={seller}
              onClick={onSellerClick}
            />
          ))}
      </YMap>
    </div>
  );
}
