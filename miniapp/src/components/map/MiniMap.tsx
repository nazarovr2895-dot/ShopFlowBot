import { useEffect, useState } from 'react';
import { loadYmaps } from './ymaps';
import { MapPlaceholder } from './MapPlaceholder';
import './Map.css';

interface Props {
  lat: number;
  lon: number;
  name: string;
  markerColor?: string;
}

export function MiniMap({ lat, lon, name, markerColor = '#3390ec' }: Props) {
  const [ymaps, setYmaps] = useState<any>(null);

  useEffect(() => {
    loadYmaps().then(setYmaps).catch(() => {});
  }, []);

  if (!ymaps) return <MapPlaceholder height={150} />;

  const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapMarker } = ymaps;

  return (
    <div className="mini-map">
      <YMap
        location={{ center: [lon, lat], zoom: 16 }}
        mode="vector"
      >
        <YMapDefaultSchemeLayer />
        <YMapDefaultFeaturesLayer />
        <YMapMarker coordinates={[lon, lat]}>
          <div
            className="seller-marker"
            style={{ background: markerColor }}
            title={name}
          >
            <div className="seller-marker__inner" />
          </div>
        </YMapMarker>
      </YMap>
    </div>
  );
}
