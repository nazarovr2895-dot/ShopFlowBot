import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { YandexMapProvider } from '../components/map/YandexMapProvider';
import { SellersMap } from '../components/map/SellersMap';
import { MapPlaceholder } from '../components/map/MapPlaceholder';
import { api } from '../api/client';
import type { SellerGeoItem } from '../types';
import '../components/map/Map.css';

export function SellersMapPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cityId = searchParams.get('city_id') ? Number(searchParams.get('city_id')) : undefined;

  const [sellers, setSellers] = useState<SellerGeoItem[]>([]);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [selected, setSelected] = useState<SellerGeoItem | null>(null);

  // Fetch all sellers for the city once on mount
  useEffect(() => {
    api.getSellersGeo(cityId)
      .then(setSellers)
      .catch(() => {})
      .finally(() => setInitialLoaded(true));
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
              height="100%"
            />
          ) : (
            <MapPlaceholder height="100%" />
          )}
        </YandexMapProvider>

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
