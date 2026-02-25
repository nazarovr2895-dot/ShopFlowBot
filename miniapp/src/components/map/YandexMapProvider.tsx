import React, { useEffect, useState, createContext, useContext } from 'react';
import { loadYmaps } from './ymaps';
import { MapPlaceholder } from './MapPlaceholder';
import { getYmapsApiKey } from '../../api/ymapsConfig';

interface YmapsComponents {
  YMap: any;
  YMapDefaultSchemeLayer: any;
  YMapDefaultFeaturesLayer: any;
  YMapMarker: any;
  YMapListener: any;
  YMapControls: any;
  YMapDefaultMarker: any;
  YMapClusterer: any;
  clusterByGrid: any;
}

const YmapsContext = createContext<YmapsComponents | null>(null);

export function useYmaps(): YmapsComponents | null {
  return useContext(YmapsContext);
}

interface Props {
  children: React.ReactNode;
  height?: number | string;
}

export function YandexMapProvider({ children, height = 300 }: Props) {
  const [components, setComponents] = useState<YmapsComponents | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!getYmapsApiKey()) {
      setError(true);
      return;
    }
    loadYmaps()
      .then(setComponents)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return <MapPlaceholder height={height} />;
  }

  if (!components) {
    return <MapPlaceholder height={height} />;
  }

  return (
    <YmapsContext.Provider value={components}>
      {children}
    </YmapsContext.Provider>
  );
}
