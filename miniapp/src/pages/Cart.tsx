import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CartSellerGroup } from '../types';
import { api } from '../api/client';
import { Loader, EmptyState } from '../components';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import './Cart.css';

export function Cart() {
  const navigate = useNavigate();
  const { setBackButton, hapticFeedback, showAlert } = useTelegramWebApp();
  const [cart, setCart] = useState<CartSellerGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setBackButton(false);
  }, [setBackButton]);

  const loadCart = async () => {
    setLoading(true);
    try {
      const data = await api.getCart();
      setCart(data);
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

  const updateQuantity = async (productId: number, quantity: number) => {
    try {
      hapticFeedback('light');
      await api.updateCartItem(productId, quantity);
      await loadCart();
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const removeItem = async (productId: number) => {
    try {
      hapticFeedback('medium');
      await api.removeCartItem(productId);
      await loadCart();
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

  const grandTotal = cart.reduce((sum, g) => sum + g.total, 0);

  return (
    <div className="cart-page">
      <h1 className="cart-page__title">Корзина</h1>
      {cart.map((group) => (
        <section key={group.seller_id} className="cart-group">
          <h2 className="cart-group__shop">{group.shop_name}</h2>
          <ul className="cart-group__list">
            {group.items.map((item) => (
              <li key={item.product_id} className="cart-item">
                <div className="cart-item__info">
                  <span className="cart-item__name">{item.name}</span>
                  {item.is_preorder && item.preorder_delivery_date && (
                    <span className="cart-item__preorder-date">
                      Предзаказ на {new Date(item.preorder_delivery_date).toLocaleDateString('ru-RU')}
                    </span>
                  )}
                  <span className="cart-item__price">{formatPrice(item.price)}</span>
                </div>
                <div className="cart-item__actions">
                  <div className="cart-item__qty">
                    <button
                      type="button"
                      className="cart-item__qty-btn"
                      onClick={() => updateQuantity(item.product_id, Math.max(0, item.quantity - 1))}
                      aria-label="Уменьшить"
                    >
                      −
                    </button>
                    <span className="cart-item__qty-num">{item.quantity}</span>
                    <button
                      type="button"
                      className="cart-item__qty-btn"
                      onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                      aria-label="Увеличить"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className="cart-item__remove"
                    onClick={() => removeItem(item.product_id)}
                    aria-label="Удалить"
                  >
                    🗑
                  </button>
                </div>
                <div className="cart-item__total">
                  {formatPrice(item.price * item.quantity)}
                </div>
              </li>
            ))}
          </ul>
          <div className="cart-group__total">
            Итого по магазину: {formatPrice(group.total)}
          </div>
        </section>
      ))}
      <div className="cart-page__footer">
        <div className="cart-page__grand-total">
          К оплате: {formatPrice(grandTotal)}
        </div>
        <button
          type="button"
          className="cart-page__checkout-btn"
          onClick={() => {
            hapticFeedback('medium');
            navigate('/cart/checkout');
          }}
        >
          Оформить заказ
        </button>
      </div>
    </div>
  );
}
