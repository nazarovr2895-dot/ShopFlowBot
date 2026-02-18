import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CartSellerGroup } from '../types';
import { api } from '../api/client';
import { Loader, EmptyState, ProductImage } from '../components';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { isBrowser } from '../utils/environment';
import { getGuestCart, guestCartToGroups, updateGuestCartItem, removeGuestCartItem } from '../utils/guestCart';
import './Cart.css';

export function Cart() {
  const navigate = useNavigate();
  const { setBackButton, hapticFeedback, showAlert } = useTelegramWebApp();
  const [cart, setCart] = useState<CartSellerGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setBackButton(false);
  }, [setBackButton]);

  const isGuest = isBrowser() && !api.isAuthenticated();

  const loadCart = async () => {
    setLoading(true);
    try {
      if (isGuest) {
        // Guest: read from localStorage
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
  };

  useEffect(() => {
    loadCart();
  }, []);

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
          Способ и время доставки можно выбрать при оформлении заказа
        </p>
      </div>
    </div>
  );
}
