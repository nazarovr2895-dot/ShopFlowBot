import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { PublicSellerDetail, Product } from '../types';
import { api, hasTelegramAuth } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { isBrowser } from '../utils/environment';
import { Loader, EmptyState, ProductImage, HeartIcon } from '../components';
import './ShopDetails.css';

type ProductTab = 'regular' | 'preorder';

export function ShopDetails() {
  const { sellerId } = useParams<{ sellerId: string }>();
  const navigate = useNavigate();
  const { setBackButton, hapticFeedback, showAlert } = useTelegramWebApp();
  const [seller, setSeller] = useState<PublicSellerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [productTab, setProductTab] = useState<ProductTab>('regular');
  const [preorderDateForProductId, setPreorderDateForProductId] = useState<number | null>(null);
  const [isInFavorites, setIsInFavorites] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);
  const [favoriteProductIds, setFavoriteProductIds] = useState<Set<number>>(new Set());
  const [togglingProductFavorite, setTogglingProductFavorite] = useState<number | null>(null);
  const [loyalty, setLoyalty] = useState<{ points_balance: number; linked: boolean } | null>(null);

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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    };

    loadSeller();
  }, [sellerId]);

  // Load favorite state when seller is loaded (try always; 401 → not in favorites)
  useEffect(() => {
    if (!seller) return;
    const check = async () => {
      try {
        const list = await api.getFavoriteSellers();
        setIsInFavorites(list.some((s) => s.seller_id === seller.seller_id));
      } catch {
        setIsInFavorites(false);
      }
    };
    check();
  }, [seller?.seller_id, seller]);

  // Load favorite products when seller is loaded
  useEffect(() => {
    if (!seller || !hasTelegramAuth()) {
      setFavoriteProductIds(new Set());
      return;
    }
    const loadFavorites = async () => {
      try {
        const favorites = await api.getFavoriteProducts();
        const productIds = new Set(favorites.map((p) => p.product_id));
        setFavoriteProductIds(productIds);
      } catch {
        setFavoriteProductIds(new Set());
      }
    };
    loadFavorites();
  }, [seller?.seller_id, seller]);

  // Load loyalty (programme participation and points) when seller is loaded and user is authenticated
  useEffect(() => {
    if (!seller || !hasTelegramAuth()) {
      setLoyalty(null);
      return;
    }
    let cancelled = false;
    api
      .getMyLoyaltyAtSeller(seller.seller_id)
      .then((data) => {
        if (!cancelled) setLoyalty({ points_balance: data.points_balance, linked: data.linked });
      })
      .catch(() => {
        if (!cancelled) setLoyalty({ points_balance: 0, linked: false });
      });
    return () => {
      cancelled = true;
    };
  }, [seller?.seller_id]);

  const toggleFavorite = async () => {
    if (!seller || togglingFavorite) return;
    setTogglingFavorite(true);
    try {
      hapticFeedback('light');
      if (isInFavorites) {
        await api.removeFavoriteSeller(seller.seller_id);
        setIsInFavorites(false);
        showAlert('Убрано из моих цветочных');
      } else {
        await api.addFavoriteSeller(seller.seller_id);
        setIsInFavorites(true);
        showAlert('Добавлено в мои цветочные');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка';
      if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('аутентификац')) {
        showAlert('Откройте приложение в Telegram, чтобы добавлять магазины в «Мои цветочные».');
      } else {
        showAlert(msg);
      }
    } finally {
      setTogglingFavorite(false);
    }
  };

  const toggleProductFavorite = async (productId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (togglingProductFavorite === productId) return;
    
    const isFavorite = favoriteProductIds.has(productId);
    setTogglingProductFavorite(productId);
    
    // Optimistic update
    const newFavorites = new Set(favoriteProductIds);
    if (isFavorite) {
      newFavorites.delete(productId);
    } else {
      newFavorites.add(productId);
    }
    setFavoriteProductIds(newFavorites);
    
    try {
      hapticFeedback('light');
      if (isFavorite) {
        await api.removeFavoriteProduct(productId);
        showAlert('Убрано из избранного');
      } else {
        await api.addFavoriteProduct(productId);
        showAlert('Добавлено в избранное');
      }
    } catch (err) {
      // Rollback on error
      setFavoriteProductIds(favoriteProductIds);
      const msg = err instanceof Error ? err.message : 'Ошибка';
      if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('аутентификац')) {
        showAlert('Откройте приложение в Telegram, чтобы добавлять товары в избранное.');
      } else {
        showAlert(msg);
      }
    } finally {
      setTogglingProductFavorite(null);
    }
  };

  const addToCart = async (productId: number, preorderDeliveryDate?: string | null) => {
    setAddingId(productId);
    try {
      hapticFeedback('light');
      await api.addCartItem(productId, 1, preorderDeliveryDate);
      showAlert(preorderDeliveryDate ? 'Предзаказ добавлен в корзину' : 'Добавлено в корзину');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка';
      const isAuthError = msg.includes('401') || msg.includes('Unauthorized') || msg.includes('Missing') || msg.includes('X-Telegram');
      if (isAuthError) {
        if (isBrowser()) {
          showAlert('Войдите в профиле, чтобы добавлять товары в корзину');
          navigate('/profile');
        } else {
          showAlert('Добавление в корзину доступно только в приложении Telegram. Откройте магазин через бота.');
        }
      } else {
        showAlert(msg);
      }
    } finally {
      setAddingId(null);
      setPreorderDateForProductId(null);
    }
  };

  const confirmPreorderDate = (productId: number, dateStr: string) => {
    addToCart(productId, dateStr);
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

  const showFavoriteBtn = true;
  const hasPickup = seller.delivery_type === 'pickup' || seller.delivery_type === 'both';
  const showMapButton = hasPickup && seller.map_url;

  return (
    <div className="shop-details">
      {seller.banner_url && (
        <div className="shop-details__banner">
          <img src={api.getProductImageUrl(seller.banner_url) ?? ''} alt="" />
        </div>
      )}
      <header className="shop-details__header">
        <img className="shop-details__logo" src="/android-chrome-512x512.png" alt="" />
        <div className="shop-details__header-text">
          <h1 className="shop-details__name">{seller.shop_name || 'Без названия'}</h1>
        </div>
      </header>

      {seller.description && (
        <p className="shop-details__description">{seller.description}</p>
      )}

      <div className="shop-details__info">
        {hasPickup && (
          <>
            {seller.city_name && (
              <div className="shop-details__info-item">
                <span className="shop-details__info-label">Город</span>
                <span className="shop-details__info-value">{seller.city_name}</span>
              </div>
            )}
            {seller.district_name && (
              <div className="shop-details__info-item">
                <span className="shop-details__info-label">Район</span>
                <span className="shop-details__info-value">{seller.district_name}</span>
              </div>
            )}
            {(seller.metro_name || seller.metro_walk_minutes != null) && (
              <div className="shop-details__info-item">
                <span className="shop-details__info-label">Метро</span>
                <span className="shop-details__info-value">
                  {seller.metro_name || '—'}
                  {seller.metro_walk_minutes != null && seller.metro_walk_minutes > 0 && ` (${seller.metro_walk_minutes} мин)`}
                </span>
              </div>
            )}
            {seller.address_name && (
              <div className="shop-details__info-item">
                <span className="shop-details__info-label">Адрес</span>
                <span className="shop-details__info-value">{seller.address_name}</span>
              </div>
            )}
          </>
        )}
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
      </div>

      <div className="shop-details__actions">
        {showFavoriteBtn && (
          <button
            type="button"
            className="shop-details__favorite-btn"
            onClick={toggleFavorite}
            disabled={togglingFavorite}
          >
            {togglingFavorite ? '…' : isInFavorites ? 'Убрать из моих цветочных' : 'Добавить в мои цветочные'}
          </button>
        )}
        {showMapButton && (
          <a
            href={seller.map_url!}
            target="_blank"
            rel="noopener noreferrer"
            className="shop-details__map-btn"
          >
            Открыть на карте
          </a>
        )}
      </div>

      {loyalty !== null && (
        <div className="shop-details__loyalty">
          {loyalty.linked ? (
            <p className="shop-details__loyalty-text shop-details__loyalty-text_linked">
              Вы участвуете в программе накопления баллов. Баланс: {loyalty.points_balance} баллов
            </p>
          ) : (
            <p className="shop-details__loyalty-text">
              Ваш номер не участвует в программе накопления баллов. Укажите номер телефона в разделе «Мои данные» в профиле, чтобы участвовать в программе.
            </p>
          )}
        </div>
      )}

      {(seller.products.length > 0 || (seller.preorder_enabled && (seller.preorder_products?.length ?? 0) > 0)) && (
        <div className="shop-details__products">
          {seller.products.length > 0 && (seller.preorder_products?.length ?? 0) > 0 && seller.preorder_enabled && (
            <div className="shop-details__product-tabs">
              <button
                type="button"
                className={`shop-details__product-tab ${productTab === 'regular' ? 'active' : ''}`}
                onClick={() => setProductTab('regular')}
              >
                В наличии
              </button>
              <button
                type="button"
                className={`shop-details__product-tab ${productTab === 'preorder' ? 'active' : ''}`}
                onClick={() => setProductTab('preorder')}
              >
                По предзаказу
              </button>
            </div>
          )}
          <h2 className="shop-details__products-title">
            {productTab === 'preorder' ? 'Товары по предзаказу' : 'Товары'}
            ({productTab === 'preorder' ? (seller.preorder_products?.length ?? 0) : seller.products.length})
          </h2>
          <div className="shop-details__products-grid">
            {(productTab === 'preorder' ? (seller.preorder_products ?? []) : seller.products).map((product: Product) => {
              const isPreorder = productTab === 'preorder' || product.is_preorder;
              const inStock = !isPreorder && (product.quantity ?? 0) > 0;
              const isAdding = addingId === product.id;
              const showDatePicker = preorderDateForProductId === product.id;
              const firstPhotoId = (product.photo_ids && product.photo_ids[0]) || product.photo_id;
              const imageUrl = api.getProductImageUrl(firstPhotoId ?? null);
              const availableDates = seller.preorder_available_dates ?? [];
              return (
                <div
                  key={product.id}
                  className="shop-details__product-card"
                  onClick={() => !showDatePicker && navigate(`/shop/${seller.seller_id}/product/${product.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (!showDatePicker) navigate(`/shop/${seller.seller_id}/product/${product.id}`);
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
                    {hasTelegramAuth() && (
                      <div className="shop-details__product-card-heart">
                        <HeartIcon
                          isFavorite={favoriteProductIds.has(product.id)}
                          onClick={(e) => toggleProductFavorite(product.id, e)}
                          size={20}
                        />
                      </div>
                    )}
                  </div>
                  <div className="shop-details__product-card-info">
                    <span className="shop-details__product-card-name">{product.name}</span>
                    <span className="shop-details__product-card-price">
                      {formatPrice(product.price)}
                    </span>
                    {showDatePicker && availableDates.length > 0 ? (
                      <div className="shop-details__preorder-dates" onClick={(e) => e.stopPropagation()}>
                        <span className="shop-details__preorder-dates-label">Выберите дату:</span>
                        {availableDates.slice(0, 4).map((d) => (
                          <button
                            key={d}
                            type="button"
                            className="shop-details__preorder-date-btn"
                            onClick={() => confirmPreorderDate(product.id, d)}
                            disabled={isAdding}
                          >
                            {new Date(d).toLocaleDateString('ru-RU')}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="shop-details__preorder-date-cancel"
                          onClick={() => setPreorderDateForProductId(null)}
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="shop-details__product-card-add"
                        disabled={(!inStock && !isPreorder) || isAdding}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isPreorder && availableDates.length > 0) {
                            setPreorderDateForProductId(product.id);
                          } else {
                            addToCart(product.id);
                          }
                        }}
                      >
                        {isAdding ? '…' : isPreorder ? 'Заказать на дату' : inStock ? 'В корзину' : 'Нет'}
                      </button>
                    )}
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
