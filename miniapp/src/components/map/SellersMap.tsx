import { useMemo, useRef, useCallback } from 'react';
import { useYmaps } from './YandexMapProvider';
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
  onZoomChange?: (zoom: number) => void;
  height?: number | string;
  initialCenter?: [number, number];
}

// Default center: Moscow
const DEFAULT_CENTER: [number, number] = [37.6173, 55.7558];
const DEFAULT_ZOOM = 11;

export function SellersMap({ sellers, onSellerClick, onBoundsChange, onZoomChange, height = '100%', initialCenter }: Props) {
  const ymaps = useYmaps();
  const boundsCallbackRef = useRef(onBoundsChange);
  boundsCallbackRef.current = onBoundsChange;
  const zoomCallbackRef = useRef(onZoomChange);
  zoomCallbackRef.current = onZoomChange;

  const center = useMemo(() => {
    if (initialCenter) return initialCenter;
    const withCoords = sellers.filter(s => s.geo_lat && s.geo_lon);
    if (withCoords.length === 0) return DEFAULT_CENTER;
    const avgLon = withCoords.reduce((sum, s) => sum + s.geo_lon!, 0) / withCoords.length;
    const avgLat = withCoords.reduce((sum, s) => sum + s.geo_lat!, 0) / withCoords.length;
    return [avgLon, avgLat] as [number, number];
  }, [sellers, initialCenter]);

  // Build GeoJSON features for the clusterer
  const features = useMemo(() =>
    sellers
      .filter(s => s.geo_lat && s.geo_lon)
      .map(s => ({
        type: 'Feature' as const,
        id: String(s.seller_id),
        geometry: {
          type: 'Point' as const,
          coordinates: [s.geo_lon!, s.geo_lat!] as [number, number],
        },
        properties: { seller: s },
      })),
    [sellers]
  );

  const handleUpdate = useCallback(({ location }: any) => {
    if (location?.zoom != null && zoomCallbackRef.current) {
      zoomCallbackRef.current(location.zoom);
    }
    if (!boundsCallbackRef.current || !location?.bounds) return;
    const [[sw_lon, sw_lat], [ne_lon, ne_lat]] = location.bounds;
    boundsCallbackRef.current({ sw_lat, sw_lon, ne_lat, ne_lon });
  }, []);

  if (!ymaps) return null;

  const {
    YMap,
    YMapDefaultSchemeLayer,
    YMapDefaultFeaturesLayer,
    YMapListener,
    YMapMarker,
    YMapClusterer,
    clusterByGrid,
    reactify,
  } = ymaps;

  // Render individual marker (single point, not a cluster)
  const renderMarker = (feature: any) => {
    const seller: SellerGeoItem = feature.properties.seller;
    const color = seller.metro_line_color || '#3390ec';
    return (
      <YMapMarker coordinates={feature.geometry.coordinates}>
        <div
          className="seller-marker"
          style={{ background: color }}
          onClick={() => onSellerClick(seller)}
          title={seller.shop_name || ''}
        >
          <div className="seller-marker__inner" />
        </div>
      </YMapMarker>
    );
  };

  // Render cluster (grouped markers)
  const renderCluster = (coordinates: [number, number], clusterFeatures: any[]) => (
    <YMapMarker coordinates={coordinates}>
      <div className="cluster-marker">
        <span className="cluster-marker__count">{clusterFeatures.length}</span>
      </div>
    </YMapMarker>
  );

  const method = clusterByGrid({ gridSize: 64 });

  return (
    <div className="map-container" style={{ height }}>
      <YMap
        location={reactify.useDefault({ center, zoom: DEFAULT_ZOOM })}
        mode="vector"
      >
        <YMapDefaultSchemeLayer />
        <YMapDefaultFeaturesLayer />
        {(onBoundsChange || onZoomChange) && <YMapListener onUpdate={handleUpdate} />}
        {features.length > 0 && (
          <YMapClusterer
            method={method}
            features={features}
            marker={renderMarker}
            cluster={renderCluster}
          />
        )}
      </YMap>
    </div>
  );
}
