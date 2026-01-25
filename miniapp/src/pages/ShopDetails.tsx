import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { PublicSellerDetail } from '../types';
import { api } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { Loader, EmptyState } from '../components';
import './ShopDetails.css';

export function ShopDetails() {
  const { sellerId } = useParams<{ sellerId: string }>();
  const navigate = useNavigate();
  const { setBackButton, setMainButton, openShop, hapticFeedback } = useTelegramWebApp();
  
  const [seller, setSeller] = useState<PublicSellerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Set up back button
  useEffect(() => {
    setBackButton(true, () => {
      navigate(-1);
    });

    return () => {
      setBackButton(false);
    };
  }, [setBackButton, navigate]);

  // Load seller details
  useEffect(() => {
    if (!sellerId) return;

    const loadSeller = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await api.getSellerDetail(parseInt(sellerId));
        setSeller(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    };

    loadSeller();
  }, [sellerId]);

  // Set up main button
  useEffect(() => {
    if (seller && seller.available_slots > 0) {
      setMainButton(
        'Открыть магазин',
        () => {
          hapticFeedback('medium');
          openShop(seller.seller_id);
        },
        { isVisible: true, isActive: true }
      );
    }

    return () => {
      setMainButton('', () => {}, { isVisible: false });
    };
  }, [seller, setMainButton, openShop, hapticFeedback]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const getDeliveryLabel = (type: string | null) => {
    switch (type) {
      case 'delivery':
        return 'Доставка';
      case 'pickup':
        return 'Самовывоз';
      case 'both':
        return 'Доставка и самовывоз';
      default:
        return 'Не указано';
    }
  };

  if (loading) {
    return <Loader centered />;
  }

  if (error || !seller) {
    return (
      <div className="shop-details">
        <EmptyState
          title="Магазин не найден"
          description={error || 'Попробуйте позже'}
          icon="🏪"
        />
      </div>
    );
  }

  return (
    <div className="shop-details">
      <header className="shop-details__header">
        <h1 className="shop-details__name">{seller.shop_name || 'Без названия'}</h1>
        <span
          className={`shop-details__slots ${seller.available_slots <= 2 ? 'low' : ''} ${
            seller.available_slots === 0 ? 'none' : ''
          }`}
        >
          {seller.available_slots > 0
            ? `${seller.available_slots} свободных слотов`
            : 'Нет свободных слотов'}
        </span>
      </header>

      {seller.description && (
        <p className="shop-details__description">{seller.description}</p>
      )}

      <div className="shop-details__info">
        <div className="shop-details__info-item">
          <span className="shop-details__info-label">Локация</span>
          <span className="shop-details__info-value">
            {[seller.metro_name, seller.district_name, seller.city_name]
              .filter(Boolean)
              .join(', ') || 'Не указана'}
          </span>
        </div>

        <div className="shop-details__info-item">
          <span className="shop-details__info-label">Способ получения</span>
          <span className="shop-details__info-value">
            {getDeliveryLabel(seller.delivery_type)}
          </span>
        </div>

        {seller.map_url && (
          <a
            href={seller.map_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shop-details__map-link"
          >
            Открыть на карте
          </a>
        )}
      </div>

      {seller.products.length > 0 && (
        <div className="shop-details__products">
          <h2 className="shop-details__products-title">
            Товары ({seller.products.length})
          </h2>
          <div className="shop-details__products-list">
            {seller.products.map((product) => (
              <div key={product.id} className="shop-details__product">
                <div className="shop-details__product-info">
                  <span className="shop-details__product-name">{product.name}</span>
                  {product.description && (
                    <span className="shop-details__product-desc">
                      {product.description}
                    </span>
                  )}
                </div>
                <span className="shop-details__product-price">
                  {formatPrice(product.price)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
