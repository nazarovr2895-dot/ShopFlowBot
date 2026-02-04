import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { PublicSellerDetail } from '../types';
import { api, hasTelegramAuth } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { Loader, EmptyState, ProductImage } from '../components';
import './ShopDetails.css';

export function ShopDetails() {
  const { sellerId } = useParams<{ sellerId: string }>();
  const navigate = useNavigate();
  const { setBackButton, hapticFeedback, showAlert } = useTelegramWebApp();
  const [seller, setSeller] = useState<PublicSellerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);

  // Set up back button
  useEffect(() => {
    setBackButton(true, () => {
      navigate(-1);
    });

    return () => {
      setBackButton(false);
    };
  }, [setBackButton, navigate]);

  // Load seller details and record visit
  useEffect(() => {
    if (!sellerId) return;

    const loadSeller = async () => {
      setLoading(true);
      setError(null);

      try {
        const id = parseInt(sellerId, 10);
        const data = await api.getSellerDetail(id);
        setSeller(data);
        // Запись посещения только при наличии Telegram init data (внутри Mini App). Иначе не дергаем API — избегаем 401 в консоли.
        if (hasTelegramAuth()) {
          try {
            await api.recordVisitedSeller(data.seller_id);
          } catch {
            // игнорируем сбой записи
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    };

    loadSeller();
  }, [sellerId]);

  const addToCart = async (productId: number) => {
    setAddingId(productId);
    try {
      hapticFeedback('light');
      await api.addCartItem(productId, 1);
      showAlert('Добавлено в корзину');
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setAddingId(null);
    }
  };

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
            {seller.delivery_type && (seller.delivery_type === 'delivery' || seller.delivery_type === 'both') && (
              seller.delivery_price === 0 
                ? ' (бесплатно)' 
                : ` (${formatPrice(seller.delivery_price)})`
            )}
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
          <div className="shop-details__products-grid">
            {seller.products.map((product) => {
              const inStock = (product.quantity ?? 0) > 0;
              const isAdding = addingId === product.id;
              const firstPhotoId = (product.photo_ids && product.photo_ids[0]) || product.photo_id;
              const imageUrl = api.getProductImageUrl(firstPhotoId ?? null);
              return (
                <div
                  key={product.id}
                  className="shop-details__product-card"
                  onClick={() => navigate(`/shop/${seller.seller_id}/product/${product.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/shop/${seller.seller_id}/product/${product.id}`);
                    }
                  }}
                >
                  <div className="shop-details__product-card-image-wrap">
                    <ProductImage
                      src={imageUrl}
                      alt={product.name}
                      className="shop-details__product-card-image"
                      placeholderClassName="shop-details__product-card-image-placeholder"
                    />
                  </div>
                  <div className="shop-details__product-card-info">
                    <span className="shop-details__product-card-name">{product.name}</span>
                    <span className="shop-details__product-card-price">
                      {formatPrice(product.price)}
                    </span>
                    <button
                      type="button"
                      className="shop-details__product-card-add"
                      disabled={!inStock || isAdding}
                      onClick={(e) => {
                        e.stopPropagation();
                        addToCart(product.id);
                      }}
                    >
                      {isAdding ? '…' : inStock ? 'В корзину' : 'Нет'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
