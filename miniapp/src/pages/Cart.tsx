import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CartSellerGroup, CartItemEntry } from '../types';
import { api } from '../api/client';
import { Loader, EmptyState, ProductImage } from '../components';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { isBrowser } from '../utils/environment';
import { getGuestCart, guestCartToGroups, updateGuestCartItem, removeGuestCartItem } from '../utils/guestCart';
import { useReservationTimer, computeRemaining } from '../hooks/useReservationTimer';
import './Cart.css';

function ReservationBadge({ item, onExpired, onExtend }: {
  item: CartItemEntry;
  onExpired: () => void;
  onExtend: (productId: number) => void;
}) {
  const { formattedTime, hasExpired, isWarning } = useReservationTimer(item.reserved_at);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (hasExpired && !expiredRef.current) {
      expiredRef.current = true;
      onExpired();
    }
  }, [hasExpired, onExpired]);

  if (!item.reserved_at || item.is_preorder) return null;
  if (hasExpired) return null;

  return (
    <div className={`cart-item__reservation ${isWarning ? 'cart-item__reservation--warning' : ''}`}>
      <span className="cart-item__reservation-icon">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </span>
      <span className="cart-item__reservation-time">{formattedTime}</span>
      <button
        type="button"
        className="cart-item__reservation-extend"
        onClick={(e) => { e.stopPropagation(); onExtend(item.product_id); }}
      >
        Продлить
      </button>
    </div>
  );
}

export function Cart() {
  const navigate = useNavigate();
  const { setBackButton, hapticFeedback, showAlert } = useTelegramWebApp();
  const [cart, setCart] = useState<CartSellerGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setBackButton(false);
  }, [setBackButton]);

  const isGuest = isBrowser() && !api.isAuthenticated();

  const loadCart = useCallback(async () => {
    setLoading(true);
    try {
      if (isGuest) {
        const guestItems = getGuestCart();
        setCart(guestCartToGroups(guestItems));
      } else {
        const data = await api.getCart();
        setCart(data);
      }
    } catch (e) {
      console.error(e);
      setCart([]);
    } finally {
      setLoading(false);
    }
  }, [isGuest]);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  // Auto-refresh cart when any reservation expires (check every 5s)
  useEffect(() => {
    if (isGuest) return;
    const interval = setInterval(() => {
      const hasExpired = cart.some((g) =>
        g.items.some((item) =>
          item.reserved_at && !item.is_preorder && computeRemaining(item.reserved_at) <= 0
        )
      );
      if (hasExpired) {
        loadCart();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [cart, isGuest, loadCart]);

  const handleReservationExpired = useCallback(() => {
    showAlert('Время резервирования истекло, товар убран из корзины');
    // Cart will auto-refresh via the interval above
  }, [showAlert]);

  const handleExtendReservation = useCallback(async (productId: number) => {
    try {
      hapticFeedback('light');
      const result = await api.extendReservation(productId);
      // Update local state with new reserved_at
      setCart((prev) =>
        prev.map((group) => ({
          ...group,
          items: group.items.map((item) =>
            item.product_id === productId
              ? { ...item, reserved_at: result.reserved_at }
              : item
          ),
        }))
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      if (msg.includes('409') || msg.includes('истекло')) {
        showAlert('Резервирование истекло. Обновляем корзину...');
        await loadCart();
      } else {
        showAlert(msg);
      }
    }
  }, [hapticFeedback, showAlert, loadCart]);

  const updateQuantity = async (productId: number, quantity: number, sellerId?: number) => {
    try {
      hapticFeedback('light');
      if (isGuest && sellerId != null) {
        updateGuestCartItem(productId, sellerId, quantity);
        setCart(guestCartToGroups(getGuestCart()));
      } else {
        await api.updateCartItem(productId, quantity);
        await loadCart();
      }
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const removeItem = async (productId: number, sellerId?: number) => {
    try {
      hapticFeedback('medium');
      if (isGuest && sellerId != null) {
        removeGuestCartItem(productId, sellerId);
        setCart(guestCartToGroups(getGuestCart()));
      } else {
        await api.removeCartItem(productId);
        await loadCart();
      }
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const formatPrice = (n: number) =>
    new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);

  if (loading) return <Loader centered />;

  if (cart.length === 0) {
    return (
      <div className="cart-page">
        <EmptyState
          title="Корзина пуста"
          description="Добавьте товары из каталога"
          icon="🛒"
        />
      </div>
    );
  }

  const grandTotalGoods = cart.reduce((sum, g) => sum + g.total, 0);
  const totalDelivery = cart.reduce((sum, g) => sum + (g.delivery_price ?? 0), 0);
  const grandTotalWithDelivery = grandTotalGoods + totalDelivery;
  const totalItemCount = cart.reduce((s, g) => s + g.items.length, 0);

  const itemCountLabel = (n: number) => {
    if (n === 1) return '1 товар';
    if (n >= 2 && n <= 4) return `${n} товара`;
    return `${n} товаров`;
  };

  return (
    <div className="cart-page">
      <h1 className="cart-page__title">Корзина</h1>
      <div className="cart-page__body">
      <div className="cart-page__items">
      {cart.map((group) => (
        <section key={group.seller_id} className="cart-group">
          <h2 className="cart-group__shop">{group.shop_name}</h2>
          <ul className="cart-group__list">
            {group.items.map((item) => (
              <li key={item.product_id} className="cart-item">
                <div className="cart-item__image-wrap">
                  <ProductImage
                    src={api.getProductImageUrl(item.photo_id ?? null)}
                    alt={item.name}
                    className="cart-item__image"
                    placeholderClassName="cart-item__image-placeholder"
                    placeholderIconClassName="cart-item__image-placeholder-icon"
                  />
                </div>
                <div className="cart-item__body">
                  <span className="cart-item__price">{formatPrice(item.price)}</span>
                  <span className="cart-item__name">{item.name}</span>
                  {item.is_preorder && item.preorder_delivery_date && (
                    <span className="cart-item__preorder-tag">
                      Предзаказ на {new Date(item.preorder_delivery_date).toLocaleDateString('ru-RU')}
                    </span>
                  )}
                  <ReservationBadge
                    item={item}
                    onExpired={handleReservationExpired}
                    onExtend={handleExtendReservation}
                  />
                  <div className="cart-item__row">
                    <button
                      type="button"
                      className="cart-item__remove"
                      onClick={() => removeItem(item.product_id, group.seller_id)}
                      aria-label="Удалить"
                    >
                      <span aria-hidden>🗑</span>
                    </button>
                    <div className="cart-item__qty">
                      <button
                        type="button"
                        className="cart-item__qty-btn"
                        onClick={() => updateQuantity(item.product_id, Math.max(0, item.quantity - 1), group.seller_id)}
                        aria-label="Уменьшить"
                      >
                        −
                      </button>
                      <span className="cart-item__qty-num">{item.quantity}</span>
                      <button
                        type="button"
                        className="cart-item__qty-btn"
                        onClick={() => updateQuantity(item.product_id, item.quantity + 1, group.seller_id)}
                        aria-label="Увеличить"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <span className="cart-item__total">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <div className="cart-group__total">
            Итого по магазину: {formatPrice(group.total)}
            {(group.delivery_price ?? 0) > 0 && (
              <span className="cart-group__delivery-note">
                {' '}(доставка +{formatPrice(group.delivery_price!)})
              </span>
            )}
          </div>
        </section>
      ))}
      </div>{/* .cart-page__items */}
      <div className="cart-page__footer">
        <div className="cart-page__footer-header">
          <h2 className="cart-page__footer-title">Ваша корзина</h2>
          <span className="cart-page__footer-count">{itemCountLabel(totalItemCount)}</span>
        </div>
        <div className="cart-page__summary">
          <div className="cart-page__summary-row">
            <span>Товары ({totalItemCount})</span>
            <span>{formatPrice(grandTotalGoods)}</span>
          </div>
          {totalDelivery > 0 && (
            <div className="cart-page__summary-row">
              <span>Доставка</span>
              <span>{formatPrice(totalDelivery)}</span>
            </div>
          )}
          <div className="cart-page__summary-row cart-page__summary-row--total">
            <span>{totalDelivery > 0 ? 'При доставке' : 'К оплате'}</span>
            <span>{formatPrice(totalDelivery > 0 ? grandTotalWithDelivery : grandTotalGoods)}</span>
          </div>
        </div>
        <button
          type="button"
          className="cart-page__checkout-btn"
          onClick={() => {
            hapticFeedback('medium');
            navigate(isGuest ? '/cart/guest-checkout' : '/cart/checkout');
          }}
        >
          Оформить заказ
        </button>
        <p className="cart-page__footer-note">
          Товары бронируются на 5 минут
        </p>
      </div>
      </div>{/* .cart-page__body */}
    </div>
  );
}
