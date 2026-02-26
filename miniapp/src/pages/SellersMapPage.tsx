import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { YandexMapProvider } from '../components/map/YandexMapProvider';
import { SellersMap } from '../components/map/SellersMap';
import type { BBox } from '../components/map/SellersMap';
import { MapPlaceholder } from '../components/map/MapPlaceholder';
import { api } from '../api/client';
import type { SellerGeoItem } from '../types';
import '../components/map/Map.css';

/** Minimum zoom level to allow "show sellers" action (~district level) */
const MIN_ZOOM_FOR_LOAD = 12;

export function SellersMapPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cityId = searchParams.get('city_id') ? Number(searchParams.get('city_id')) : undefined;

  const [sellers, setSellers] = useState<SellerGeoItem[]>([]);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [selected, setSelected] = useState<SellerGeoItem | null>(null);

  // Zone-loading state
  const [zoom, setZoom] = useState(DEFAULT_INITIAL_ZOOM);
  const [currentBbox, setCurrentBbox] = useState<BBox | null>(null);
  const [showLoadButton, setShowLoadButton] = useState(false);
  const [loadingZone, setLoadingZone] = useState(false);

  // Track city center for initial positioning
  const [cityCenter, setCityCenter] = useState<[number, number] | undefined>();
  // Track whether initial sellers were loaded to avoid duplicate city-level fetches
  const initialFetchDone = useRef(false);

  // Initial load: fetch all city sellers for center calculation + first view
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;

    api.getSellersGeo(cityId)
      .then(data => {
        setSellers(data);
        // Compute city center from seller coordinates
        const withCoords = data.filter(s => s.geo_lat && s.geo_lon);
        if (withCoords.length > 0) {
          const avgLon = withCoords.reduce((s, d) => s + d.geo_lon!, 0) / withCoords.length;
          const avgLat = withCoords.reduce((s, d) => s + d.geo_lat!, 0) / withCoords.length;
          setCityCenter([avgLon, avgLat]);
        }
      })
      .catch(() => {})
      .finally(() => setInitialLoaded(true));
  }, [cityId]);

  // Handle map viewport changes
  const handleBoundsChange = useCallback((bbox: BBox) => {
    setCurrentBbox(bbox);
    // Show "load zone" button after user moves the map
    setShowLoadButton(true);
  }, []);

  // Handle zoom level changes
  const handleZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  // "Показать магазины здесь" button handler
  const handleLoadZone = useCallback(async () => {
    if (!currentBbox) return;
    setLoadingZone(true);
    try {
      const data = await api.getSellersGeo(cityId, currentBbox);
      setSellers(data);
      setShowLoadButton(false);
    } catch {
      // Keep existing sellers on error
    } finally {
      setLoadingZone(false);
    }
  }, [cityId, currentBbox]);

  const handleSellerClick = useCallback((seller: SellerGeoItem) => {
    setSelected(seller);
  }, []);

  const handleGoToShop = useCallback(() => {
    if (selected) {
      navigate(`/shop/${selected.seller_id}`);
    }
  }, [selected, navigate]);

  return (
    <div className="sellers-map-page">
      {/* Header */}
      <div className="sellers-map-page__header">
        <button className="sellers-map-page__back" onClick={() => navigate(-1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="sellers-map-page__title">
          Магазины на карте
          {initialLoaded && sellers.length > 0 && ` (${sellers.length})`}
        </span>
      </div>

      {/* Map */}
      <div className="sellers-map-page__map">
        <YandexMapProvider height="100%">
          {initialLoaded ? (
            <SellersMap
              sellers={sellers}
              onSellerClick={handleSellerClick}
              onBoundsChange={handleBoundsChange}
              onZoomChange={handleZoomChange}
              initialCenter={cityCenter}
              height="100%"
            />
          ) : (
            <MapPlaceholder height="100%" />
          )}
        </YandexMapProvider>

        {/* Zoom hint: too far out */}
        {initialLoaded && zoom < MIN_ZOOM_FOR_LOAD && (
          <div className="sellers-map-page__zoom-hint">
            Приблизьте карту для поиска магазинов
          </div>
        )}

        {/* "Show shops here" button: visible after moving map when zoomed in enough */}
        {initialLoaded && zoom >= MIN_ZOOM_FOR_LOAD && showLoadButton && (
          <button
            className="sellers-map-page__load-zone"
            onClick={handleLoadZone}
            disabled={loadingZone}
          >
            {loadingZone ? 'Загрузка...' : 'Показать магазины здесь'}
          </button>
        )}

        {/* Seller popup (inside map container for absolute positioning) */}
        {selected && (
          <div className="seller-popup" onClick={(e) => e.stopPropagation()}>
            <div className="seller-popup__name">{selected.shop_name}</div>
            <div className="seller-popup__meta">
              {selected.metro_line_color && (
                <span
                  className="seller-popup__metro-dot"
                  style={{ background: selected.metro_line_color }}
                />
              )}
              {selected.metro_name && <span>{selected.metro_name}</span>}
              {selected.delivery_type && (
                <span>
                  {selected.delivery_type === 'delivery' ? 'Доставка' :
                    selected.delivery_type === 'pickup' ? 'Самовывоз' : 'Доставка и самовывоз'}
                </span>
              )}
            </div>
            {selected.min_price != null && (
              <div className="seller-popup__price">от {selected.min_price} ₽</div>
            )}
            <button className="seller-popup__btn" onClick={handleGoToShop}>
              Перейти в магазин
            </button>
            <button
              style={{
                width: '100%',
                padding: 10,
                border: 'none',
                background: 'transparent',
                color: 'var(--tg-theme-hint-color, #999)',
                fontSize: 14,
                cursor: 'pointer',
                marginTop: 4,
              }}
              onClick={() => setSelected(null)}
            >
              Закрыть
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Default initial zoom (city-level overview) */
const DEFAULT_INITIAL_ZOOM = 11;
