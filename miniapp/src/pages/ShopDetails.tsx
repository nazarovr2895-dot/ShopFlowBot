import { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import type { PublicSellerDetail, Product } from '../types';
import { api } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { isBrowser } from '../utils/environment';
import { useShopCart } from '../contexts/ShopCartContext';
import { Loader, EmptyState, ProductImage, ProductModal, LiquidGlassCard } from '../components';
import { FloatingCartBar } from '../components/FloatingCartBar';
import { ShopCartPanel } from '../components/ShopCartPanel';
import { getYmapsApiKey } from '../api/ymapsConfig';
import { formatPrice } from '../utils/formatters';
import './ShopDetails.css';

const MiniMap = lazy(() => import('../components/map/MiniMap').then(m => ({ default: m.MiniMap })));
const YandexMapProvider = lazy(() => import('../components/map/YandexMapProvider').then(m => ({ default: m.YandexMapProvider })));

type ProductTab = 'regular' | 'preorder';

// Иконки для информационных полей
const DistrictIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { setBackButton, hapticFeedback, showAlert } = useTelegramWebApp();
  const [seller, setSeller] = useState<PublicSellerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [productTab, setProductTab] = useState<ProductTab>('regular');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [preorderDateForProductId, setPreorderDateForProductId] = useState<number | null>(null);
  const [isInFavorites, setIsInFavorites] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);
  const [favoriteProductIds, setFavoriteProductIds] = useState<Set<number>>(new Set());
  const [togglingProductFavorite, setTogglingProductFavorite] = useState<number | null>(null);
  const [loyalty, setLoyalty] = useState<{
    points_balance: number;
    linked: boolean;
    points_percent: number;
    max_points_discount_percent: number;
    points_to_ruble_rate: number;
  } | null>(null);
  const [bannerLoaded, setBannerLoaded] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const { cartQuantities, addItem: ctxAddItem, updateQuantity: ctxUpdateQuantity, isPanelOpen, setPanelOpen, itemCount: cartItemCount } = useShopCart();

  // Set up back button — close cart panel first, then navigate back
  useEffect(() => {
    setBackButton(true, () => {
      if (isPanelOpen) {
        setPanelOpen(false);
      } else {
        navigate(-1);
      }
    });

    return () => {
      setBackButton(false);
    };
  }, [setBackButton, navigate, isPanelOpen, setPanelOpen]);

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

  // Auto-open product modal if ?product=<id> is present (e.g. from Favorites)
  useEffect(() => {
    const productParam = searchParams.get('product');
    if (!productParam || !seller) return;

    const pid = parseInt(productParam, 10);
    if (isNaN(pid)) return;

    const allProducts = [...seller.products, ...(seller.preorder_products ?? [])];
    const found = allProducts.find((p) => p.id === pid);
    if (found) {
      setSelectedProduct(found);
      // Clear param so closing the modal doesn't re-open it
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('product');
        return next;
      }, { replace: true });
    }
  }, [seller, searchParams, setSearchParams]);

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
    if (!seller || !api.isAuthenticated()) {
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
    if (!seller || !api.isAuthenticated()) {
      setLoyalty(null);
      return;
    }
    let cancelled = false;
    api
      .getMyLoyaltyAtSeller(seller.seller_id)
      .then((data) => {
        if (!cancelled) setLoyalty({
          points_balance: data.points_balance,
          linked: data.linked,
          points_percent: data.points_percent,
          max_points_discount_percent: data.max_points_discount_percent,
          points_to_ruble_rate: data.points_to_ruble_rate,
        });
      })
      .catch(() => {
        if (!cancelled) setLoyalty({
          points_balance: 0, linked: false, points_percent: 0,
          max_points_discount_percent: 100, points_to_ruble_rate: 1,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [seller?.seller_id]);

  // Cart quantities are now managed by ShopCartContext

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
      } else {
        await api.addFavoriteProduct(productId);
      }
    } catch (err) {
      // Rollback on error
      setFavoriteProductIds(favoriteProductIds);
      const msg = err instanceof Error ? err.message : 'Ошибка';
      if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('аутентификац')) {
        showAlert('Откройте приложение в Telegram, чтобы добавлять товары в избранное.');
      }
    } finally {
      setTogglingProductFavorite(null);
    }
  };

  const addToCart = async (productId: number, preorderDeliveryDate?: string | null, quantity: number = 1) => {
    setAddingId(productId);
    try {
      hapticFeedback('light');

      const allProducts = [...(seller?.products ?? []), ...(seller?.preorder_products ?? [])];
      const product = allProducts.find((p: Product) => p.id === productId);
      if (!product) return;

      const result = await ctxAddItem({
        product: { id: product.id, name: product.name, price: product.price, photo_id: product.photo_id },
        quantity,
        preorderDeliveryDate,
        sellerName: seller?.shop_name || undefined,
        sellerDeliveryType: seller?.delivery_type ?? null,
        sellerCityId: seller?.city_id ?? null,
        sellerGiftNoteEnabled: seller?.gift_note_enabled ?? false,
      });

      if (!preorderDeliveryDate && result.reserved_at) {
        showAlert('Товар забронирован на 5 минут');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка';
      const isAuthError = msg.includes('401') || msg.includes('Unauthorized') || msg.includes('Missing') || msg.includes('X-Telegram');
      const isStockError = msg.includes('409') || msg.includes('Товар закончился') || msg.includes('Недостаточно');
      if (isStockError) {
        showAlert('Товар закончился');
      } else if (isAuthError) {
        if (isBrowser()) {
          showAlert('Войдите в профиле, чтобы добавлять товары в корзину');
          navigate('/profile');
        } else {
          showAlert('Добавление в корзину доступно только в приложении Telegram. Откройте магазин через бота.');
        }
      }
    } finally {
      setAddingId(null);
      setPreorderDateForProductId(null);
    }
  };

  const updateCartQuantity = async (productId: number, newQty: number, e: React.MouseEvent) => {
    e.stopPropagation();
    hapticFeedback('light');
    await ctxUpdateQuantity(productId, newQty);
  };

  const confirmPreorderDate = (productId: number, dateStr: string) => {
    addToCart(productId, dateStr);
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
  const showMapButton = seller.geo_lat && seller.geo_lon && getYmapsApiKey();

  // Today's working hours (Mon=0 ... Sun=6)
  const todayIdx = (new Date().getDay() + 6) % 7;
  const todayHoursData = seller.working_hours?.[String(todayIdx)];
  const todayLabel = todayHoursData && typeof todayHoursData === 'object' && todayHoursData.open && todayHoursData.close
    ? `${todayHoursData.open} — ${todayHoursData.close}`
    : todayHoursData === null ? 'Выходной' : '—';

  return (
    <div className={`shop-details${cartItemCount > 0 ? ' shop-details--has-cart' : ''}`}>
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
          {api.getProductImageUrl(seller.logo_url) ? (
            <img className="shop-details__logo" src={api.getProductImageUrl(seller.logo_url)!} alt="" />
          ) : (
            <div className="shop-details__logo-placeholder">
              {(seller.shop_name || '?')[0].toUpperCase()}
            </div>
          )}
          <div className="shop-details__header-text">
            <h1
              className={`shop-details__name${(seller.owner_fio || seller.inn || seller.ogrn) ? ' shop-details__name--clickable' : ''}`}
              onClick={() => { if (seller.owner_fio || seller.inn || seller.ogrn) setLegalModalOpen(true); }}
            >
              {seller.shop_name || 'Без названия'}
            </h1>
            {(seller.subscriber_count ?? 0) > 0 && (
              <div className="shop-details__subscriber-count">
                {seller.subscriber_count} {formatSubscriberLabel(seller.subscriber_count ?? 0)}
              </div>
            )}
          </div>
          <div className="shop-details__header-actions">
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
            {(seller.owner_username || seller.owner_tg_id) && (
              <a
                href={seller.owner_username ? `https://t.me/${seller.owner_username}` : `tg://user?id=${seller.owner_tg_id}`}
                target={isBrowser() ? '_blank' : undefined}
                rel={isBrowser() ? 'noopener noreferrer' : undefined}
                className="shop-details__chat-btn"
              >
                Написать
              </a>
            )}
          </div>
        </header>
      </div>

      {seller.description && (
        <p className="shop-details__description">{seller.description}</p>
      )}

      {/* Collapsible working hours */}
      {seller.working_hours && Object.keys(seller.working_hours).length > 0 && (
        <div className="shop-details__hours-compact">
          <button
            type="button"
            className="shop-details__hours-summary"
            onClick={() => setHoursExpanded((prev) => !prev)}
          >
            <span className="shop-details__hours-summary-left">
              <ClockIcon />
              {seller.is_open_now != null && (
                <span className={`shop-details__hours-badge ${seller.is_open_now ? 'shop-details__hours-badge--open' : 'shop-details__hours-badge--closed'}`}>
                  {seller.is_open_now ? 'Открыто' : 'Закрыто'}
                </span>
              )}
              <span className="shop-details__hours-today">
                Сегодня {todayLabel}
              </span>
            </span>
            <svg
              className={`shop-details__hours-chevron${hoursExpanded ? ' shop-details__hours-chevron--open' : ''}`}
              width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {hoursExpanded && (
            <div className="shop-details__hours-full">
              {WEEKDAY_LABELS.map((label, idx) => {
                const key = String(idx);
                const day = seller.working_hours?.[key];
                const isDayOff = day === null;
                const hasHours = day && typeof day === 'object' && day.open && day.close;
                const isToday = idx === todayIdx;
                return (
                  <div key={idx} className={`shop-details__hours-day${isDayOff ? ' shop-details__hours-day--off' : ''}${isToday ? ' shop-details__hours-day--today' : ''}`}>
                    <span className="shop-details__hours-day-label">{label}</span>
                    <span className="shop-details__hours-day-value">
                      {isDayOff ? 'Выходной' : hasHours ? `${day.open} — ${day.close}` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Compact info strip */}
      <div className="shop-details__info-strip">
        {hasPickup && seller.metro_name && (
          <div className="shop-details__info-line">
            <DistrictIcon />
            <span className="shop-details__info-line-text">
              {seller.metro_line_color && (
                <span
                  className="shop-details__metro-dot"
                  style={{ background: seller.metro_line_color }}
                />
              )}
              м. {seller.metro_name}
              {seller.metro_walk_minutes ? ` (${seller.metro_walk_minutes} мин)` : ''}
            </span>
          </div>
        )}
        {hasPickup && seller.address_name && (
          <>
            <div className="shop-details__info-line">
              <AddressIcon />
              <span className="shop-details__info-line-text">{seller.address_name?.replace(/^г\s+[^,]+,\s*/, '') || seller.address_name}</span>
              {/* Toggle inline mini-map */}
              {showMapButton && (
                <button
                  type="button"
                  className="shop-details__map-link-inline"
                  aria-label="Показать на карте"
                  onClick={() => setShowMiniMap(prev => !prev)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {showMiniMap ? 'Скрыть' : 'На карте'}
                </button>
              )}
            </div>
            {/* Inline mini-map — loads only on button click */}
            {showMiniMap && seller.geo_lat && seller.geo_lon && (
              <div style={{ marginTop: 8 }}>
                <Suspense fallback={<div style={{ height: 150, borderRadius: 12, background: 'var(--tg-theme-secondary-bg-color, #f0f0f0)' }} />}>
                  <YandexMapProvider height={150}>
                    <MiniMap
                      lat={seller.geo_lat}
                      lon={seller.geo_lon}
                      name={seller.shop_name || ''}
                      markerColor={seller.metro_line_color}
                    />
                  </YandexMapProvider>
                </Suspense>
              </div>
            )}
          </>
        )}
        <div className="shop-details__info-line">
          <DeliveryIcon />
          <span className="shop-details__info-line-text">
            {getDeliveryLabel(seller.delivery_type)}
            {seller.delivery_type && (seller.delivery_type === 'delivery' || seller.delivery_type === 'both') && (
              seller.min_delivery_price != null
                ? seller.min_delivery_price === 0
                  ? ' — бесплатно'
                  : ` — от ${seller.min_delivery_price.toLocaleString('ru-RU')} ₽`
                : ' — цена зависит от зоны'
            )}
          </span>
        </div>
      </div>

      {/* Loyalty chip — compact inline */}
      {loyalty !== null && (
        <div className="shop-details__loyalty">
          {loyalty.linked ? (
            <span className="shop-details__loyalty-chip shop-details__loyalty-chip--linked">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              {loyalty.points_balance} баллов
            </span>
          ) : (
            <span className="shop-details__loyalty-chip shop-details__loyalty-chip--unlinked">
              Укажите телефон в профиле для накопления баллов
            </span>
          )}
        </div>
      )}

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
              onClick={() => { setProductTab('regular'); setSelectedCategoryId(null); }}
            >
              <span className="shop-details__nav-bar-tab-text">Актуальные</span>
            </button>
            <button
              type="button"
              className={`shop-details__nav-bar-tab ${productTab === 'preorder' ? 'shop-details__nav-bar-tab--active' : ''}`}
              onClick={() => { setProductTab('preorder'); setSelectedCategoryId(null); }}
            >
              <span className="shop-details__nav-bar-tab-text">Предзаказ</span>
            </button>
          </LiquidGlassCard>
        </div>
      )}

      {seller.subscription_active === false && (
        <div style={{
          padding: '0.75rem 1rem',
          margin: '0 1rem 0.75rem',
          borderRadius: '8px',
          background: 'rgba(239, 68, 68, 0.06)',
          border: '1px solid rgba(239, 68, 68, 0.15)',
          textAlign: 'center',
          fontSize: '0.85rem',
          color: '#b91c1c',
        }}>
          Магазин временно не принимает заказы
        </div>
      )}

      {(seller.products.length > 0 || (seller.preorder_enabled && (seller.preorder_products?.length ?? 0) > 0)) && (() => {
        const currentProducts = productTab === 'preorder'
          ? (seller.preorder_products ?? [])
          : seller.products;
        const hasCategories = (seller.categories?.length ?? 0) > 0 && productTab === 'regular';
        const filteredProducts = (hasCategories && selectedCategoryId != null)
          ? currentProducts.filter((p: Product) => p.category_id === selectedCategoryId)
          : currentProducts;
        return (
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

          {hasCategories && (
            <div className="shop-details__category-chips">
              <button
                type="button"
                className={`shop-details__category-chip${selectedCategoryId == null ? ' shop-details__category-chip--active' : ''}`}
                onClick={() => setSelectedCategoryId(null)}
              >
                Все
              </button>
              {seller.categories!.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`shop-details__category-chip${selectedCategoryId === cat.id ? ' shop-details__category-chip--active' : ''}`}
                  onClick={() => setSelectedCategoryId(cat.id)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          <h2 className="shop-details__products-title">
            {productTab === 'preorder' ? 'Товары по предзаказу' : 'Товары'}
            ({filteredProducts.length})
          </h2>
          <div className="shop-details__products-grid">
            {filteredProducts.map((product: Product) => {
              const isPreorder = productTab === 'preorder' || product.is_preorder;
              const inStock = !isPreorder && (product.quantity ?? 0) > 0;
              const isAdding = addingId === product.id;
              const showDatePicker = preorderDateForProductId === product.id;
              const firstPhotoId = (product.photo_ids && product.photo_ids[0]) || product.photo_id;
              const imageUrl = api.getProductImageUrl(firstPhotoId ?? null);
              const availableDates = seller.preorder_available_dates ?? [];
              const cartQty = cartQuantities.get(product.id) || 0;
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
                  </div>
                  <div className="shop-details__product-card-info">
                    <span className="shop-details__product-card-name">{product.name}</span>
                    <div className="shop-details__product-card-price-row">
                      <span className="shop-details__product-card-price">{formatPrice(product.price)}</span>
                      {!showDatePicker && (
                        cartQty > 0 && !isPreorder ? (
                          <div className="shop-details__qty-counter shop-details__qty-counter--compact" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="shop-details__qty-counter-btn"
                              onClick={(e) => updateCartQuantity(product.id, cartQty - 1, e)}
                            >
                              −
                            </button>
                            <span className="shop-details__qty-counter-value">{cartQty}</span>
                            <button
                              type="button"
                              className="shop-details__qty-counter-btn"
                              onClick={(e) => updateCartQuantity(product.id, cartQty + 1, e)}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="shop-details__product-card-add-pill"
                            disabled={(!inStock && !isPreorder) || isAdding || seller.subscription_active === false}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (seller.subscription_active === false) return;
                              if (isPreorder && availableDates.length > 0) {
                                setPreorderDateForProductId(product.id);
                              } else {
                                addToCart(product.id);
                              }
                            }}
                          >
                            <span>{seller.subscription_active === false ? 'Недоступно' : isAdding ? '…' : isPreorder ? 'Предзаказ' : inStock ? 'В корзину' : 'Нет'}</span>
                          </button>
                        )
                      )}
                    </div>
                    {showDatePicker && availableDates.length > 0 && (
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
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}

      {/* Legal Info Modal */}
      {legalModalOpen && seller && (
        <div
          className="shop-details__legal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setLegalModalOpen(false); }}
        >
          <div className="shop-details__legal-modal">
            <h3 className="shop-details__legal-title">Информация о продавце</h3>
            {seller.owner_fio && (
              <p className="shop-details__legal-line">
                <span className="shop-details__legal-label">ИП</span> {seller.owner_fio}
              </p>
            )}
            {seller.inn && (
              <p className="shop-details__legal-line">
                <span className="shop-details__legal-label">ИНН:</span> {seller.inn}
              </p>
            )}
            {seller.ogrn && (
              <p className="shop-details__legal-line">
                <span className="shop-details__legal-label">ОГРН:</span> {seller.ogrn}
              </p>
            )}
            <button
              type="button"
              className="shop-details__legal-close"
              onClick={() => setLegalModalOpen(false)}
            >
              Закрыть
            </button>
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
          onAddToCart={(qty: number) => {
            if (selectedProduct.is_preorder && (seller?.preorder_available_dates?.length ?? 0) > 0) {
              setPreorderDateForProductId(selectedProduct.id);
            } else {
              addToCart(selectedProduct.id, null, qty);
            }
          }}
          currentCartQuantity={cartQuantities.get(selectedProduct.id) || 0}
          onUpdateCart={(qty: number) => ctxUpdateQuantity(selectedProduct.id, qty)}
          sellerId={seller.seller_id}
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
          deliveryPrice={seller.min_delivery_price ?? null}
          deliveryType={seller.delivery_type}
          loyaltyPointsPercent={loyalty?.points_percent ?? 0}
          pointsBalance={loyalty?.points_balance ?? 0}
          pointsToRubleRate={loyalty?.points_to_ruble_rate ?? 1}
          maxPointsDiscountPercent={loyalty?.max_points_discount_percent ?? 100}
          loyaltyLinked={loyalty?.linked ?? false}
        />
      )}

      {/* Per-shop floating cart */}
      <FloatingCartBar />
      <ShopCartPanel />
    </div>
  );
}
