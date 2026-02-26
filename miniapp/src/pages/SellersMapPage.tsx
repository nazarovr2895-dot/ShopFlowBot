import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { YandexMapProvider } from '../components/map/YandexMapProvider';
import { SellersMap, type BBox } from '../components/map/SellersMap';
import { MapPlaceholder } from '../components/map/MapPlaceholder';
import { api } from '../api/client';
import type { SellerGeoItem } from '../types';
import '../components/map/Map.css';

const DEBOUNCE_MS = 400;

export function SellersMapPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cityId = searchParams.get('city_id') ? Number(searchParams.get('city_id')) : undefined;

  const [sellers, setSellers] = useState<SellerGeoItem[]>([]);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [selected, setSelected] = useState<SellerGeoItem | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const fetchRef = useRef(0); // tracks latest fetch to ignore stale responses
  const initialFetchDone = useRef(false);
  const boundsActiveRef = useRef(false);

  // Initial fetch WITHOUT bounds — ensures sellers are shown immediately
  // even if the map's first onUpdate doesn't include bounds
  useEffect(() => {
    const fetchId = ++fetchRef.current;
    api.getSellersGeo(cityId)
      .then((data) => {
        if (fetchRef.current === fetchId) setSellers(data);
      })
      .catch(() => {})
      .finally(() => {
        initialFetchDone.current = true;
        if (fetchRef.current === fetchId) setInitialLoaded(true);
      });
  }, [cityId]);

  // Enable bounds-based fetching after map stabilizes
  useEffect(() => {
    if (initialLoaded) {
      const t = setTimeout(() => { boundsActiveRef.current = true; }, 1000);
      return () => clearTimeout(t);
    }
  }, [initialLoaded]);

  const handleBoundsChange = useCallback((bbox: BBox) => {
    if (!boundsActiveRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const fetchId = ++fetchRef.current;
      api.getSellersGeo(cityId, bbox)
        .then((data) => {
          if (fetchRef.current === fetchId) setSellers(data);
        })
        .catch(() => {
          if (fetchRef.current === fetchId) setSellers([]);
        });
    }, DEBOUNCE_MS);
  }, [cityId]);

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
      <div className="sellers-map-page__header" style={{ paddingTop: `calc(12px + var(--tg-header-offset, 0px))` }}>
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
              height="100%"
            />
          ) : (
            <MapPlaceholder height="100%" />
          )}
        </YandexMapProvider>
      </div>

      {/* Seller popup */}
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
  );
}
