import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { PublicSellerDetail, Product } from '../types';
import { api, hasTelegramAuth } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { isBrowser } from '../utils/environment';
import { addToGuestCart } from '../utils/guestCart';
import { Loader, EmptyState, ProductImage, HeartIcon, ProductModal, LiquidGlassCard } from '../components';
import './ShopDetails.css';

type ProductTab = 'regular' | 'preorder';

// Иконки для информационных полей
const CityIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const DistrictIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const MetroIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="12" rx="2" />
    <path d="M7 8V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3" />
    <line x1="12" y1="12" x2="12" y2="16" />
  </svg>
);

const AddressIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="22" x2="21" y2="22" />
    <line x1="6" y1="18" x2="6" y2="11" />
    <line x1="10" y1="18" x2="10" y2="11" />
    <line x1="14" y1="18" x2="14" y2="11" />
    <line x1="18" y1="18" x2="18" y2="11" />
    <polygon points="12 2 20 7 4 7" />
  </svg>
);

const ClockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const DeliveryIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13" />
    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
);

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
  const [bannerLoaded, setBannerLoaded] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

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
      setBannerLoaded(false); // Сбрасываем состояние загрузки банера

      try {
        const id = parseInt(sellerId, 10);
        const data = await api.getSellerDetail(id);
        setSeller(data);
        // Auto-select tab: if no regular products but preorder products exist, switch to preorder
        const hasRegular = data.products.length > 0;
        const hasPreorder = data.preorder_enabled && (data.preorder_products?.length ?? 0) > 0;
        if (!hasRegular && hasPreorder) {
          setProductTab('preorder');
        } else {
          setProductTab('regular');
        }
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
        if (seller) setSeller({ ...seller, subscriber_count: Math.max(0, (seller.subscriber_count || 0) - 1) });
        showAlert('Вы отписались');
      } else {
        await api.addFavoriteSeller(seller.seller_id);
        setIsInFavorites(true);
        if (seller) setSeller({ ...seller, subscriber_count: (seller.subscriber_count || 0) + 1 });
        showAlert('Вы подписались!');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка';
      if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('аутентификац')) {
        showAlert('Откройте приложение в Telegram, чтобы подписываться на магазины.');
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

      // Guest cart: browser + not authenticated → save to localStorage
      if (isBrowser() && !api.isAuthenticated()) {
        const allProducts = [...(seller?.products ?? []), ...(seller?.preorder_products ?? [])];
        const product = allProducts.find((p: Product) => p.id === productId);
        if (product) {
          addToGuestCart({
            product_id: product.id,
            seller_id: Number(sellerId),
            name: product.name,
            price: product.price,
            quantity: 1,
            photo_id: product.photo_id ?? null,
            seller_name: seller?.shop_name || undefined,
          });
        }
        showAlert(preorderDeliveryDate ? 'Предзаказ добавлен в корзину' : 'Добавлено в корзину');
        return;
      }

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

  const formatSubscriberLabel = (n: number): string => {
    const lastTwo = n % 100;
    const lastOne = n % 10;
    if (lastTwo >= 11 && lastTwo <= 19) return 'подписчиков';
    if (lastOne === 1) return 'подписчик';
    if (lastOne >= 2 && lastOne <= 4) return 'подписчика';
    return 'подписчиков';
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
          {api.getProductImageUrl(seller.banner_url) ? (
            <>
              {!bannerLoaded && (
                <div className="shop-details__banner-placeholder shop-details__banner-loading">
                  <span className="shop-details__banner-placeholder-icon">🏪</span>
                </div>
              )}
              <img
                src={api.getProductImageUrl(seller.banner_url)!}
                alt={seller.shop_name || 'Баннер магазина'}
                className={bannerLoaded ? 'shop-details__banner-loaded' : ''}
                onLoad={() => setBannerLoaded(true)}
                onError={(e) => {
                  // Если изображение не загрузилось, скрываем его
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  console.warn('[ShopDetails] Banner image failed to load:', seller.banner_url);
                }}
              />
            </>
          ) : (
            <div className="shop-details__banner-placeholder">
              <span className="shop-details__banner-placeholder-icon">🏪</span>
              <span className="shop-details__banner-placeholder-text">
                Рекомендуемый размер: 2560×400px (мин. 1280×200px)
              </span>
            </div>
          )}
        </div>
      )}

      <div className="shop-details__main-info">
        <header className="shop-details__header">
          <img className="shop-details__logo" src="/android-chrome-512x512.png" alt="" />
          <div className="shop-details__header-text">
            <h1 className="shop-details__name">{seller.shop_name || 'Без названия'}</h1>
            {(seller.subscriber_count ?? 0) > 0 && (
              <div className="shop-details__subscriber-count">
                {seller.subscriber_count} {formatSubscriberLabel(seller.subscriber_count ?? 0)}
              </div>
            )}
          </div>
        </header>

        <div className="shop-details__actions">
          {showFavoriteBtn && (
            <button
              type="button"
              className={`shop-details__subscribe-btn${isInFavorites ? ' shop-details__subscribe-btn--active' : ''}`}
              onClick={toggleFavorite}
              disabled={togglingFavorite}
            >
              {togglingFavorite ? '…' : isInFavorites ? 'Вы подписаны ✓' : 'Подписаться'}
            </button>
          )}
          {showMapButton && (
            <a
              href={seller.map_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="shop-details__map-btn"
              aria-label="Открыть на карте"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {seller.description && (
        <p className="shop-details__description">{seller.description}</p>
      )}

      {seller.working_hours && Object.keys(seller.working_hours).length > 0 && (
        <div className="shop-details__working-hours">
          <div className="shop-details__working-hours-header">
            <span className="shop-details__working-hours-title">
              <ClockIcon />
              Время работы
            </span>
            {seller.is_open_now != null && (
              <span className={`shop-details__working-hours-badge ${seller.is_open_now ? 'shop-details__working-hours-badge--open' : 'shop-details__working-hours-badge--closed'}`}>
                {seller.is_open_now ? 'Открыто' : 'Закрыто'}
              </span>
            )}
          </div>
          <div className="shop-details__working-hours-schedule">
            {WEEKDAY_LABELS.map((label, idx) => {
              const key = String(idx);
              const day = seller.working_hours?.[key];
              const isDayOff = day === null;
              const hasHours = day && typeof day === 'object' && day.open && day.close;
              return (
                <div key={idx} className={`shop-details__working-hours-day${isDayOff ? ' shop-details__working-hours-day--off' : ''}`}>
                  <span className="shop-details__working-hours-day-label">{label}</span>
                  <span className="shop-details__working-hours-day-value">
                    {isDayOff ? 'Выходной' : hasHours ? `${day.open} — ${day.close}` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="shop-details__info">
        {hasPickup && (
          <>
            {seller.city_name && (
              <div className="shop-details__info-item">
                <span className="shop-details__info-label">
                  <CityIcon />
                  Город
                </span>
                <span className="shop-details__info-value">{seller.city_name}</span>
              </div>
            )}
            {seller.district_name && (
              <div className="shop-details__info-item">
                <span className="shop-details__info-label">
                  <DistrictIcon />
                  Район
                </span>
                <span className="shop-details__info-value">{seller.district_name}</span>
              </div>
            )}
            {(seller.metro_name || seller.metro_walk_minutes != null) && (
              <div className="shop-details__info-item">
                <span className="shop-details__info-label">
                  <MetroIcon />
                  Метро
                </span>
                <span className="shop-details__info-value">
                  {seller.metro_name || '—'}
                  {seller.metro_walk_minutes != null && seller.metro_walk_minutes > 0 && ` (${seller.metro_walk_minutes} мин)`}
                </span>
              </div>
            )}
            {seller.address_name && (
              <div className="shop-details__info-item">
                <span className="shop-details__info-label">
                  <AddressIcon />
                  Адрес
                </span>
                <span className="shop-details__info-value">{seller.address_name}</span>
              </div>
            )}
          </>
        )}
        <div className="shop-details__info-item">
          <span className="shop-details__info-label">
            <DeliveryIcon />
            Способ получения
          </span>
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

      {/* Навигационная панель: Актуальные / Предзаказ */}
      {(() => {
        if (import.meta.env.MODE === 'development') {
          console.log('[ShopDetails] Nav bar condition:', {
            regularProducts: seller.products.length,
            preorderProducts: seller.preorder_products?.length ?? 0,
            preorderEnabled: seller.preorder_enabled,
            preorderDates: seller.preorder_available_dates,
            productTab,
          });
        }
        return null;
      })()}
      {seller.products.length > 0 && (seller.preorder_products?.length ?? 0) > 0 && seller.preorder_enabled && (
        <div className="shop-details__nav-bar">
          <LiquidGlassCard className="shop-details__nav-bar-container">
            <button
              type="button"
              className={`shop-details__nav-bar-tab ${productTab === 'regular' ? 'shop-details__nav-bar-tab--active' : ''}`}
              onClick={() => setProductTab('regular')}
            >
              <span className="shop-details__nav-bar-tab-text">Актуальные</span>
            </button>
            <button
              type="button"
              className={`shop-details__nav-bar-tab ${productTab === 'preorder' ? 'shop-details__nav-bar-tab--active' : ''}`}
              onClick={() => setProductTab('preorder')}
            >
              <span className="shop-details__nav-bar-tab-text">Предзаказ</span>
            </button>
          </LiquidGlassCard>
        </div>
      )}

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
          {productTab === 'preorder' && (
            <div className="shop-details__preorder-info">
              {(seller.preorder_discount_percent ?? 0) > 0 && (
                <div className="shop-details__preorder-discount-badge">
                  🎁 Скидка {seller.preorder_discount_percent}% при заказе за {seller.preorder_discount_min_days ?? 7}+ дней
                </div>
              )}
              {seller.preorder_max_per_date != null && seller.preorder_max_per_date > 0 && (
                <div className="shop-details__preorder-capacity">
                  Лимит: {seller.preorder_max_per_date} предзаказов на дату
                </div>
              )}
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
                  onClick={() => !showDatePicker && setSelectedProduct(product)}
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
                          size={28}
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
                        <span>{isAdding ? '…' : isPreorder ? 'Заказать на дату' : inStock ? 'В корзину' : 'Нет'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Product Modal */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          isOpen={!!selectedProduct}
          onClose={() => {
            setSelectedProduct(null);
            setPreorderDateForProductId(null);
          }}
          isFavorite={favoriteProductIds.has(selectedProduct.id)}
          onToggleFavorite={(e) => toggleProductFavorite(selectedProduct.id, e)}
          onAddToCart={() => {
            if (selectedProduct.is_preorder && (seller?.preorder_available_dates?.length ?? 0) > 0) {
              setPreorderDateForProductId(selectedProduct.id);
            } else {
              addToCart(selectedProduct.id);
            }
          }}
          isAdding={addingId === selectedProduct.id}
          inStock={selectedProduct.quantity ? selectedProduct.quantity > 0 : false}
          isPreorder={selectedProduct.is_preorder || false}
          availableDates={seller?.preorder_available_dates ?? []}
          onSelectPreorderDate={(date) => {
            confirmPreorderDate(selectedProduct.id, date);
            setSelectedProduct(null);
          }}
          showDatePicker={preorderDateForProductId === selectedProduct.id}
          onCancelDatePicker={() => setPreorderDateForProductId(null)}
        />
      )}
    </div>
  );
}
