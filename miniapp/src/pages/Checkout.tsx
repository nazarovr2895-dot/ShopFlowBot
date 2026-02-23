import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CartSellerGroup } from '../types';
import { api } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { EmptyState, ProductImage, DesktopBackNav, AddressAutocomplete } from '../components';
import { isBrowser } from '../utils/environment';
import { computeRemaining } from '../hooks/useReservationTimer';
import './Checkout.css';

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return '';
  let normalized = digits.startsWith('8') ? '7' + digits.slice(1) : digits.startsWith('7') ? digits : '7' + digits;
  normalized = normalized.slice(0, 11);
  return normalized;
}

interface SellerLoyaltyInfo {
  points_balance: number;
  max_points_discount_percent: number;
  points_to_ruble_rate: number;
}

export function Checkout() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterSellerId = searchParams.get('seller') ? Number(searchParams.get('seller')) : null;
  const { setBackButton, hapticFeedback, showAlert, requestContact, user: telegramUser } = useTelegramWebApp();
  const [user, setUser] = useState<{
    tg_id: number;
    fio?: string;
    phone?: string;
    username?: string;
  } | null>(null);
  const [cart, setCart] = useState<CartSellerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [deliveryBySeller, setDeliveryBySeller] = useState<Record<number, 'Доставка' | 'Самовывоз'>>({});
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestingContact, setRequestingContact] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [fioInput, setFioInput] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [loyaltyBySellerMap, setLoyaltyBySellerMap] = useState<Record<number, SellerLoyaltyInfo>>({});
  const [pointsUsage, setPointsUsage] = useState<Record<number, number>>({});
  const [buyerDistrictId, setBuyerDistrictId] = useState<number | null>(null);
  const [buyerDistrictName, setBuyerDistrictName] = useState<string | null>(null);
  const [deliveryCheckResults, setDeliveryCheckResults] = useState<Record<number, { delivers: boolean; delivery_price: number; message: string }>>({});
  const [districtNameToId, setDistrictNameToId] = useState<Record<string, number>>({});
  useEffect(() => {
    const backPath = filterSellerId ? `/shop/${filterSellerId}` : '/';
    setBackButton(true, () => navigate(backPath));
    return () => setBackButton(false);
  }, [setBackButton, navigate, filterSellerId]);

  const loadUserAndCart = useCallback(async () => {
    setLoading(true);
    try {
      const [userData, cartData] = await Promise.all([
        api.getCurrentUser().catch((e) => {
          console.error(e);
          return null;
        }),
        api.getCart().catch((e) => {
          console.error(e);
          return [] as CartSellerGroup[];
        }),
      ]);
      setUser(userData ?? null);
      const cartArr = Array.isArray(cartData) ? cartData : [];
      const filteredCart = filterSellerId
        ? cartArr.filter((g) => g.seller_id === filterSellerId)
        : cartArr;
      setCart(filteredCart);

      // Initialize delivery type per seller based on their capabilities
      setDeliveryBySeller((prev) => {
        const next = { ...prev };
        for (const g of cartArr) {
          if (next[g.seller_id]) continue; // keep existing choice
          if (g.delivery_type === 'pickup') {
            next[g.seller_id] = 'Самовывоз';
          } else if (g.delivery_type === 'delivery') {
            next[g.seller_id] = 'Доставка';
          } else {
            // 'both' or null — default to Самовывоз
            next[g.seller_id] = 'Самовывоз';
          }
        }
        return next;
      });

      // Load districts for delivery zone matching based on sellers' cities
      try {
        const cityIds = [...new Set(filteredCart.map(g => g.city_id).filter((id): id is number => id != null))];
        if (cityIds.length === 0) cityIds.push(1); // fallback to Moscow
        const allDistricts = await Promise.all(cityIds.map(id => api.getDistrictsByCityId(id)));
        const nameMap: Record<string, number> = {};
        for (const districts of allDistricts) {
          for (const d of districts) nameMap[d.name] = d.id;
        }
        setDistrictNameToId(nameMap);
      } catch { /* districts not critical */ }

      // Fetch loyalty balances for each seller in cart
      if (cartArr.length > 0) {
        const loyaltyEntries = await Promise.all(
          cartArr.map(async (g) => {
            try {
              const info = await api.getMyLoyaltyAtSeller(g.seller_id);
              return [g.seller_id, {
                points_balance: info.points_balance,
                max_points_discount_percent: info.max_points_discount_percent,
                points_to_ruble_rate: info.points_to_ruble_rate,
              }] as const;
            } catch {
              return [g.seller_id, { points_balance: 0, max_points_discount_percent: 100, points_to_ruble_rate: 1 }] as const;
            }
          })
        );
        const map: Record<number, SellerLoyaltyInfo> = {};
        for (const [sid, info] of loyaltyEntries) map[sid] = info;
        setLoyaltyBySellerMap(map);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUserAndCart();
  }, [loadUserAndCart]);

  useEffect(() => {
    if (user || telegramUser) {
      const defaultFio = telegramUser?.first_name
        ? `${telegramUser.first_name}${telegramUser.last_name ? ' ' + telegramUser.last_name : ''}`.trim()
        : (user?.fio || '');
      setFioInput((prev) => (prev === '' ? defaultFio : prev));
    }
  }, [user?.fio, telegramUser?.first_name, telegramUser?.last_name]);

  const handleSavePhone = async (phone: string) => {
    const normalized = normalizePhone(phone);
    if (normalized.length !== 11 || normalized[0] !== '7') {
      showAlert('Неверный формат телефона');
      return false;
    }

    try {
      const updated = await api.updateProfile({ phone: normalized });
      setUser(updated);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка сохранения';
      showAlert(message);
      return false;
    }
  };

  const handleRequestContact = async () => {
    setRequestingContact(true);
    try {
      const phoneNumber = await requestContact();
      if (!phoneNumber) {
        showAlert('Не удалось получить номер — введите вручную');
        return;
      }
      const saved = await handleSavePhone(phoneNumber);
      if (saved) {
        setEditingPhone(false);
        setPhoneInput('');
        showAlert('Номер телефона сохранен');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка запроса контакта';
      showAlert(message);
    } finally {
      setRequestingContact(false);
    }
  };

  // Poll cart every 30s to detect expired reservations
  useEffect(() => {
    if (cart.length === 0) return;
    const interval = setInterval(async () => {
      try {
        const freshCart = await api.getCart();
        const freshArr = Array.isArray(freshCart) ? freshCart : [];
        const oldCount = cart.reduce((s, g) => s + g.items.length, 0);
        const newCount = freshArr.reduce((s, g) => s + g.items.length, 0);
        if (newCount < oldCount) {
          setCart(freshArr);
          if (newCount === 0) {
            showAlert('Все резервирования истекли. Корзина пуста.');
            navigate('/cart');
          } else {
            showAlert('Некоторые товары были убраны из корзины (истекло резервирование).');
          }
        }
      } catch { /* ignore polling errors */ }
    }, 30000);
    return () => clearInterval(interval);
  }, [cart, showAlert, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.phone) {
      showAlert('Необходимо указать номер телефона');
      return;
    }

    const anyDelivery = Object.values(deliveryBySeller).some((d) => d === 'Доставка');
    if (anyDelivery && !address.trim()) {
      showAlert('Укажите адрес доставки');
      return;
    }

    // Block submit if any seller doesn't deliver to the address
    const failedDelivery = Object.entries(deliveryCheckResults).find(([, r]) => !r.delivers);
    if (failedDelivery) {
      showAlert(failedDelivery[1].message || 'Один из магазинов не доставляет по этому адресу');
      return;
    }

    // Check for expired reservations before submitting
    const hasExpiredItems = cart.some((g) =>
      g.items.some((item) =>
        item.reserved_at && !item.is_preorder && computeRemaining(item.reserved_at) <= 0
      )
    );
    if (hasExpiredItems) {
      showAlert('Время резервирования некоторых товаров истекло. Обновляем корзину...');
      await loadUserAndCart();
      return;
    }

    setSubmitting(true);
    try {
      hapticFeedback('medium');
      const fio = (fioInput || '').trim() || 'Покупатель';

      // Build points_usage from non-zero entries
      const pointsArr = Object.entries(pointsUsage)
        .filter(([, pts]) => pts > 0)
        .map(([sid, pts]) => ({ seller_id: Number(sid), points_to_use: pts }));

      // Build per-seller delivery type list
      const deliveryArr = cart.map((g) => ({
        seller_id: g.seller_id,
        delivery_type: deliveryBySeller[g.seller_id] ?? 'Самовывоз',
      }));

      const { orders } = await api.checkoutCart({
        fio,
        phone: user.phone,
        delivery_type: 'Самовывоз', // fallback (per-seller overrides take precedence)
        address: anyDelivery ? address.trim() : 'Самовывоз',
        ...(commentInput.trim() ? { comment: commentInput.trim() } : {}),
        ...(pointsArr.length > 0 ? { points_usage: pointsArr } : {}),
        delivery_by_seller: deliveryArr,
        buyer_district_id: buyerDistrictId,
        buyer_district_name: buyerDistrictName,
      });
      setSubmitting(false);
      const ordersMsg = orders.length > 1
        ? `Заказ оформлен! По одному заказу на каждый магазин — всего ${orders.length}. Статус можно отслеживать во вкладке «Мои заказы».`
        : `Заказ оформлен! Статус можно отслеживать во вкладке «Мои заказы».`;
      showAlert(ordersMsg);
      navigate('/?tab=orders');
    } catch (e) {
      setSubmitting(false);
      showAlert(e instanceof Error ? e.message : 'Ошибка оформления');
    }
  };

  const formatPrice = (n: number) =>
    new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);
  const totalGoods = cart.reduce((sum, g) => sum + g.total, 0);
  // Only sum delivery price for sellers where delivery is chosen
  // Prefer zone price from delivery check over flat cart price
  const totalDelivery = cart.reduce((sum, g) => {
    if (deliveryBySeller[g.seller_id] !== 'Доставка') return sum;
    const checkResult = deliveryCheckResults[g.seller_id];
    if (checkResult?.delivers) return sum + checkResult.delivery_price;
    return sum + (g.delivery_price ?? 0);
  }, 0);
  // Points discount per seller
  const totalPointsDiscount = cart.reduce((sum, g) => {
    const pts = pointsUsage[g.seller_id] ?? 0;
    const info = loyaltyBySellerMap[g.seller_id];
    if (!pts || !info) return sum;
    return sum + pts * info.points_to_ruble_rate;
  }, 0);
  const totalToPay = totalGoods + totalDelivery - totalPointsDiscount;
  const hasAnyDelivery = Object.values(deliveryBySeller).some((d) => d === 'Доставка');
  const totalItemCount = cart.reduce((s, g) => s + g.items.length, 0);

  /** Max points buyer can use for a seller group (min of balance and allowed % of order). */
  const getMaxPoints = (sellerId: number, groupTotal: number): number => {
    const info = loyaltyBySellerMap[sellerId];
    if (!info || info.points_balance <= 0) return 0;
    const maxDiscountRub = groupTotal * (info.max_points_discount_percent / 100);
    const maxPointsByDiscount = info.points_to_ruble_rate > 0 ? maxDiscountRub / info.points_to_ruble_rate : 0;
    return Math.floor(Math.min(info.points_balance, maxPointsByDiscount));
  };
  const itemCountLabel = (n: number) => {
    if (n === 1) return '1 товар';
    if (n >= 2 && n <= 4) return `${n} товара`;
    return `${n} товаров`;
  };

  if (loading) {
    return (
      <div className="checkout-page">
        <h1 className="checkout-page__title">Оформление заказа</h1>
        <p>Загрузка...</p>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="checkout-page">
        <h1 className="checkout-page__title">Оформление заказа</h1>
        <EmptyState
          title="Корзина пуста"
          description="Добавьте товары в корзину и вернитесь к оформлению"
          icon="🛒"
        />
        <button
          type="button"
          className="checkout-form__submit"
          onClick={() => navigate('/catalog')}
          style={{ marginTop: 16 }}
        >
          В каталог
        </button>
      </div>
    );
  }

  return (
    <>
    <DesktopBackNav title="Оформление заказа" />
    <div className="checkout-page">
      <h1 className="checkout-page__title">Оформление заказа</h1>

      <div className="checkout-summary">
        <div className="checkout-summary__header">
          <h2 className="checkout-summary__title">Ваш заказ</h2>
          <span className="checkout-summary__count">{itemCountLabel(totalItemCount)}</span>
        </div>
        {cart.map((group) => {
          const sellerDt = deliveryBySeller[group.seller_id] ?? 'Самовывоз';
          const supportsDelivery = group.delivery_type === 'delivery' || group.delivery_type === 'both' || !group.delivery_type;
          const supportsPickup = group.delivery_type === 'pickup' || group.delivery_type === 'both' || !group.delivery_type;
          return (
          <div key={group.seller_id} className="checkout-summary__group">
            <div className="checkout-summary__shop">{group.shop_name}</div>

            {/* Per-seller delivery type selector */}
            <div className="checkout-delivery-segment" style={{ marginBottom: '0.5rem' }}>
              <span className="checkout-delivery-segment__label">Способ получения</span>
              <div className="checkout-delivery-segment__buttons">
                {supportsPickup && (
                  <button
                    type="button"
                    className={`checkout-delivery-segment__btn ${sellerDt === 'Самовывоз' ? 'checkout-delivery-segment__btn--active' : ''}`}
                    onClick={() => setDeliveryBySeller((prev) => ({ ...prev, [group.seller_id]: 'Самовывоз' }))}
                  >
                    Самовывоз
                  </button>
                )}
                {supportsDelivery && (
                  <button
                    type="button"
                    className={`checkout-delivery-segment__btn ${sellerDt === 'Доставка' ? 'checkout-delivery-segment__btn--active' : ''}`}
                    onClick={() => setDeliveryBySeller((prev) => ({ ...prev, [group.seller_id]: 'Доставка' }))}
                  >
                    Курьером
                  </button>
                )}
              </div>
            </div>

            {/* Pickup address for this seller */}
            {sellerDt === 'Самовывоз' && ((group.address_name && group.address_name.trim()) || (group.map_url && group.map_url.trim())) && (
              <div className="checkout-pickup-map" style={{ marginBottom: '0.5rem' }}>
                {group.address_name && (
                  <div className="checkout-pickup-address">{group.address_name}</div>
                )}
                {group.map_url && (
                  <a href={group.map_url} target="_blank" rel="noopener noreferrer" className="checkout-pickup-map__btn">
                    Показать на карте
                  </a>
                )}
              </div>
            )}

            <ul className="checkout-summary__list">
              {group.items.map((item) => (
                <li key={item.product_id} className="checkout-summary__item">
                  <div className="checkout-summary__item-image-wrap">
                    <ProductImage
                      src={api.getProductImageUrl(item.photo_id ?? null)}
                      alt={item.name}
                      className="checkout-summary__item-image"
                      placeholderClassName="checkout-summary__item-image-placeholder"
                      placeholderIconClassName="checkout-summary__item-image-placeholder-icon"
                    />
                  </div>
                  <div className="checkout-summary__item-body">
                    <span className="checkout-summary__item-name">{item.name}</span>
                    <div className="checkout-summary__item-meta">
                      <span className="checkout-summary__item-qty">{item.quantity} шт</span>
                      <span className="checkout-summary__item-price">{formatPrice(item.price * item.quantity)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="checkout-summary__group-total">
              Итого: {formatPrice(group.total)}
              {sellerDt === 'Доставка' && (() => {
                const checkResult = deliveryCheckResults[group.seller_id];
                const dp = checkResult?.delivers ? checkResult.delivery_price : (group.delivery_price ?? null);
                if (dp !== null && dp > 0) return <span> + доставка {formatPrice(dp)}</span>;
                if (dp === null) return <span style={{ color: 'var(--tg-theme-hint-color, #999)', fontSize: '0.85em' }}> + доставка уточняется</span>;
                return null;
              })()}
            </div>
            {/* Points usage per seller */}
            {(() => {
              const maxPts = getMaxPoints(group.seller_id, group.total);
              const info = loyaltyBySellerMap[group.seller_id];
              if (!info || info.points_balance <= 0 || maxPts <= 0) return null;
              const used = pointsUsage[group.seller_id] ?? 0;
              const discountRub = used * info.points_to_ruble_rate;
              return (
                <div className="checkout-points" style={{ padding: '0.5rem 0', borderTop: '1px dashed var(--tg-theme-hint-color, #ccc)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={used > 0}
                        onChange={(e) => {
                          setPointsUsage((prev) => ({
                            ...prev,
                            [group.seller_id]: e.target.checked ? maxPts : 0,
                          }));
                        }}
                      />
                      <span style={{ fontSize: '0.9rem' }}>Использовать баллы</span>
                    </label>
                    <span style={{ fontSize: '0.85rem', color: 'var(--tg-theme-hint-color, #999)' }}>
                      (баланс: {info.points_balance})
                    </span>
                  </div>
                  {used > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
                      <input
                        type="range"
                        min={0}
                        max={maxPts}
                        step={1}
                        value={used}
                        onChange={(e) => setPointsUsage((prev) => ({
                          ...prev,
                          [group.seller_id]: Number(e.target.value),
                        }))}
                        style={{ flex: 1 }}
                      />
                      <span style={{ fontSize: '0.9rem', minWidth: '5rem', textAlign: 'right' }}>
                        −{formatPrice(discountRub)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          );
        })}
        <div className="checkout-summary__grand-total">
          К оплате: {formatPrice(totalToPay)}
          {totalPointsDiscount > 0 && (
            <div style={{ fontSize: '0.85rem', color: 'var(--tg-theme-hint-color, #999)', fontWeight: 'normal' }}>
              скидка баллами: −{formatPrice(totalPointsDiscount)}
            </div>
          )}
        </div>
      </div>
      <form className="checkout-form" onSubmit={handleSubmit}>
        {(!user?.phone || editingPhone || (isBrowser() && !user?.phone)) && (
          <div className="checkout-form__label" style={{ marginBottom: '1rem' }}>
            <p style={{ marginBottom: '0.5rem', color: user?.phone ? undefined : '#ff6b6b' }}>
              {user?.phone ? 'Изменить номер телефона' : 'Для оформления заказа необходим номер телефона'}
            </p>
            <input
              type="tel"
              className="checkout-form__input"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="+7 999 123 45 67"
              style={{ marginBottom: 8 }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!isBrowser() && (
                <button
                  type="button"
                  className="checkout-form__submit checkout-form__submit--secondary"
                  onClick={handleRequestContact}
                  disabled={requestingContact}
                >
                  {requestingContact ? 'Запрос…' : 'Поделиться номером'}
                </button>
              )}
              <button
                type="button"
                className="checkout-form__submit checkout-form__submit--secondary"
                onClick={async () => {
                  const ok = await handleSavePhone(phoneInput);
                  if (ok) {
                    setEditingPhone(false);
                    setPhoneInput('');
                  }
                }}
                disabled={!phoneInput.trim()}
              >
                Сохранить
              </button>
              {editingPhone && (
                <button
                  type="button"
                  className="checkout-form__submit checkout-form__submit--ghost"
                  onClick={() => {
                    setEditingPhone(false);
                    setPhoneInput('');
                  }}
                >
                  Отмена
                </button>
              )}
            </div>
          </div>
        )}

        <label className="checkout-form__label" style={{ marginBottom: '0.5rem' }}>
          Имя получателя
          <input
            type="text"
            className="checkout-form__input"
            value={fioInput}
            onChange={(e) => setFioInput(e.target.value)}
            placeholder="ФИО или имя"
          />
        </label>

        {user?.phone && !editingPhone && (
          <div className="checkout-form__label checkout-form__phone-row">
            <span className="checkout-form__phone-label">Телефон</span>
            <div className="checkout-form__phone-block">
              <span className="checkout-form__phone-value">{user.phone}</span>
              <button
                type="button"
                onClick={() => {
                  setEditingPhone(true);
                  setPhoneInput(user.phone ?? '');
                }}
                className="checkout-form__link-btn"
              >
                Изменить
              </button>
            </div>
          </div>
        )}
        
        {hasAnyDelivery && (
          <div className="checkout-form__label">
            Адрес доставки
            <AddressAutocomplete
              value={address}
              onChange={setAddress}
              sellerIds={Object.entries(deliveryBySeller).filter(([, dt]) => dt === 'Доставка').map(([id]) => Number(id))}
              onDeliveryCheck={setDeliveryCheckResults}
              districtNameToId={districtNameToId}
              onDistrictIdResolved={setBuyerDistrictId}
              onDistrictResolved={setBuyerDistrictName}
              required={hasAnyDelivery}
            />
            {/* Per-seller delivery status */}
            {Object.entries(deliveryCheckResults).map(([sid, result]) => (
              <div key={sid} className={`address-autocomplete__status ${result.delivers ? 'address-autocomplete__status--ok' : 'address-autocomplete__status--error'}`}>
                {result.delivers
                  ? (result.delivery_price > 0 ? `Доставка: ${result.delivery_price} ₽` : 'Бесплатная доставка')
                  : result.message || 'Магазин не доставляет по этому адресу'}
              </div>
            ))}
          </div>
        )}
        <label className="checkout-form__label">
          Комментарий к заказу
          <textarea
            className="checkout-form__input checkout-form__textarea"
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            placeholder="Код домофона, этаж, удобное время, пожелания"
            rows={3}
          />
        </label>
        <button
          type="submit"
          className="checkout-form__submit"
          disabled={submitting || !user?.phone || Object.values(deliveryCheckResults).some(r => !r.delivers)}
        >
          {submitting ? 'Оформляем…' : 'Подтвердить заказ'}
        </button>
      </form>
    </div>
    </>
  );
}
