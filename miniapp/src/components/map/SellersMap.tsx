import { useMemo } from 'react';
import { useYmaps } from './YandexMapProvider';
import { SellerMarker } from './SellerMarker';
import type { SellerGeoItem } from '../../types';
import './Map.css';

interface Props {
  sellers: SellerGeoItem[];
  onSellerClick: (seller: SellerGeoItem) => void;
  height?: number | string;
}

// Default center: Moscow
const DEFAULT_CENTER: [number, number] = [37.6173, 55.7558];
const DEFAULT_ZOOM = 11;

export function SellersMap({ sellers, onSellerClick, height = '100%' }: Props) {
  const ymaps = useYmaps();

  const center = useMemo(() => {
    const withCoords = sellers.filter(s => s.geo_lat && s.geo_lon);
    if (withCoords.length === 0) return DEFAULT_CENTER;
    const avgLon = withCoords.reduce((sum, s) => sum + s.geo_lon!, 0) / withCoords.length;
    const avgLat = withCoords.reduce((sum, s) => sum + s.geo_lat!, 0) / withCoords.length;
    return [avgLon, avgLat] as [number, number];
  }, [sellers]);

  if (!ymaps) return null;

  const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer } = ymaps;

  return (
    <div className="map-container" style={{ height }}>
      <YMap
        location={{ center, zoom: DEFAULT_ZOOM }}
        mode="vector"
      >
        <YMapDefaultSchemeLayer />
        <YMapDefaultFeaturesLayer />
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
