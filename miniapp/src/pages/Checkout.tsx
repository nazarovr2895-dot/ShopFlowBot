import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CartSellerGroup } from '../types';
import { api } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { EmptyState, DesktopBackNav, AddressAutocomplete } from '../components';
import { DeliverySlotPicker } from '../components/DeliverySlotPicker';
import type { DeliverySlot } from '../components/DeliverySlotPicker';
import { DeliveryTypeToggle } from '../components/checkout/DeliveryTypeToggle';
import { OrderItemsSection } from '../components/checkout/OrderItemsSection';
import { isBrowser } from '../utils/environment';
import { computeRemaining } from '../hooks/useReservationTimer';
import { formatPrice } from '../utils/formatters';
import { normalizePhone } from '../utils/phone';
import './Checkout.css';

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
  const [recipientNotMe, setRecipientNotMe] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [giftNotesBySeller, setGiftNotesBySeller] = useState<Record<number, string>>({});
  const [loyaltyBySellerMap, setLoyaltyBySellerMap] = useState<Record<number, SellerLoyaltyInfo>>({});
  const [pointsUsage, setPointsUsage] = useState<Record<number, number>>({});
  const [buyerDistrictId, setBuyerDistrictId] = useState<number | null>(null);
  const [buyerDistrictName, setBuyerDistrictName] = useState<string | null>(null);
  const [deliveryCheckResults, setDeliveryCheckResults] = useState<Record<number, { delivers: boolean; delivery_price: number; district_id?: number | null; message: string }>>({});
  const [districtNameToId, setDistrictNameToId] = useState<Record<string, number>>({});
  const [slotsBySeller, setSlotsBySeller] = useState<Record<number, DeliverySlot | null>>({});
  const [paymentMethodBySeller, setPaymentMethodBySeller] = useState<Record<number, 'online' | 'on_pickup'>>({});
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

  // Auto-extend reservations while user is on checkout page.
  // Extends immediately when cart loads, then every 6 minutes (1-min buffer before 7-min TTL).
  const extendInFlightRef = useRef(false);

  useEffect(() => {
    if (cart.length === 0) return;

    const extendAll = async () => {
      const reservedProductIds: number[] = [];
      for (const group of cart) {
        for (const item of group.items) {
          if (item.reserved_at && !item.is_preorder) {
            reservedProductIds.push(item.product_id);
          }
        }
      }
      if (reservedProductIds.length === 0 || extendInFlightRef.current) return;

      extendInFlightRef.current = true;
      try {
        const results = await Promise.allSettled(
          reservedProductIds.map((pid) => api.extendReservation(pid))
        );

        const anyFailed = results.some((r) => r.status === 'rejected');
        if (anyFailed) {
          const freshCart = await api.getCart();
          const freshArr = Array.isArray(freshCart) ? freshCart : [];
          const filteredFresh = filterSellerId
            ? freshArr.filter((g) => g.seller_id === filterSellerId)
            : freshArr;
          const newCount = filteredFresh.reduce((s, g) => s + g.items.length, 0);

          if (newCount === 0) {
            showAlert('Все резервирования истекли. Корзина пуста.');
            navigate('/cart');
          } else {
            const oldCount = cart.reduce((s, g) => s + g.items.length, 0);
            if (newCount < oldCount) {
              showAlert('Некоторые товары были убраны из корзины (истекло резервирование).');
            }
            setCart(filteredFresh);
          }
        }
      } catch {
        // Network error — silently ignore, will retry on next interval
      } finally {
        extendInFlightRef.current = false;
      }
    };

    extendAll();

    const interval = setInterval(extendAll, 360_000); // 6 minutes
    return () => clearInterval(interval);
  }, [cart, filterSellerId, showAlert, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.phone) {
      showAlert('Необходимо указать номер телефона');
      return;
    }

    if (recipientNotMe && !recipientName.trim()) {
      showAlert('Укажите имя получателя');
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
        payment_method: (deliveryBySeller[g.seller_id] ?? 'Самовывоз') === 'Доставка'
          ? 'online'
          : (paymentMethodBySeller[g.seller_id] ?? 'online'),
      }));

      // Build delivery slots array from selected slots
      const deliverySlotsArr = Object.entries(slotsBySeller)
        .filter(([sid, slot]) => slot && deliveryBySeller[Number(sid)] === 'Доставка')
        .map(([sid, slot]) => ({
          seller_id: Number(sid),
          date: slot!.date,
          start: slot!.start,
          end: slot!.end,
        }));

      // Build gift notes array from non-empty entries
      const giftNotesArr = Object.entries(giftNotesBySeller)
        .filter(([, note]) => note.trim())
        .map(([sid, note]) => ({ seller_id: Number(sid), gift_note: note.trim() }));

      const { orders } = await api.checkoutCart({
        fio,
        phone: user.phone,
        delivery_type: 'Самовывоз', // fallback (per-seller overrides take precedence)
        address: anyDelivery ? address.trim() : 'Самовывоз',
        ...(commentInput.trim() ? { comment: commentInput.trim() } : {}),
        ...(pointsArr.length > 0 ? { points_usage: pointsArr } : {}),
        delivery_by_seller: deliveryArr,
        ...(deliverySlotsArr.length > 0 ? { delivery_slots: deliverySlotsArr } : {}),
        buyer_district_id: buyerDistrictId,
        buyer_district_name: buyerDistrictName,
        ...(recipientNotMe && recipientName.trim() ? {
          recipient_name: recipientName.trim(),
          recipient_phone: recipientPhone.trim() || undefined,
        } : {}),
        ...(giftNotesArr.length > 0 ? { gift_notes_by_seller: giftNotesArr } : {}),
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
        <div className="checkout-loading">
          <div className="checkout-loading__spinner" />
          <span className="checkout-loading__text">Загрузка...</span>
        </div>
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
          className="checkout-submit"
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

      {/* ===== Section: Order Items ===== */}
      <div className="checkout-section">
        <div className="checkout-section__header">
          <h2 className="checkout-section__title">Ваш заказ</h2>
          <span className="checkout-section__badge">{itemCountLabel(totalItemCount)}</span>
        </div>

        {cart.map((group) => {
          const sellerDt = deliveryBySeller[group.seller_id] ?? 'Самовывоз';
          const supportsDelivery = group.delivery_type === 'delivery' || group.delivery_type === 'both' || !group.delivery_type;
          const supportsPickup = group.delivery_type === 'pickup' || group.delivery_type === 'both' || !group.delivery_type;
          return (
            <div key={group.seller_id} className="checkout-seller">
              <div className="checkout-seller__name">{group.shop_name}</div>

              {/* Delivery type toggle */}
              <DeliveryTypeToggle
                supportsDelivery={supportsDelivery}
                supportsPickup={supportsPickup}
                selected={sellerDt}
                onChange={(type) => {
                  setDeliveryBySeller((prev) => ({ ...prev, [group.seller_id]: type as 'Доставка' | 'Самовывоз' }));
                  if (type === 'Доставка') {
                    setPaymentMethodBySeller((prev) => ({ ...prev, [group.seller_id]: 'online' }));
                  }
                }}
              />

              {/* Pickup address */}
              {sellerDt === 'Самовывоз' && ((group.address_name && group.address_name.trim()) || (group.map_url && group.map_url.trim())) && (
                <div className="checkout-pickup">
                  {group.address_name && (
                    <div className="checkout-pickup__address">{group.address_name}</div>
                  )}
                  {group.map_url && (
                    <a href={group.map_url} target="_blank" rel="noopener noreferrer" className="checkout-pickup__map-btn">
                      Показать на карте
                    </a>
                  )}
                </div>
              )}

              {/* Payment method toggle (pickup = choose, delivery = info only) */}
              {sellerDt === 'Самовывоз' && (
                <div className="checkout-toggle">
                  <span className="checkout-toggle__label">Способ оплаты</span>
                  <div className="checkout-toggle__pills">
                    <button
                      type="button"
                      className={`checkout-toggle__pill ${(paymentMethodBySeller[group.seller_id] ?? 'online') === 'on_pickup' ? 'checkout-toggle__pill--active' : ''}`}
                      onClick={() => setPaymentMethodBySeller((prev) => ({ ...prev, [group.seller_id]: 'on_pickup' }))}
                    >
                      При получении
                    </button>
                    <button
                      type="button"
                      className={`checkout-toggle__pill ${(paymentMethodBySeller[group.seller_id] ?? 'online') === 'online' ? 'checkout-toggle__pill--active' : ''}`}
                      onClick={() => setPaymentMethodBySeller((prev) => ({ ...prev, [group.seller_id]: 'online' }))}
                    >
                      Картой онлайн
                    </button>
                  </div>
                </div>
              )}
              {sellerDt === 'Доставка' && (
                <div className="checkout-toggle">
                  <span className="checkout-toggle__label">Способ оплаты</span>
                  <span className="checkout-toggle__info">Картой онлайн</span>
                </div>
              )}

              {/* Delivery time slot picker */}
              {sellerDt === 'Доставка' && (
                <DeliverySlotPicker
                  sellerId={group.seller_id}
                  selectedSlot={slotsBySeller[group.seller_id] ?? null}
                  onSelect={(slot) => setSlotsBySeller(prev => ({ ...prev, [group.seller_id]: slot }))}
                />
              )}

              {/* Items + Subtotal */}
              <OrderItemsSection
                items={group.items}
                groupTotal={group.total}
                deliveryType={sellerDt}
                deliveryPrice={(() => {
                  const checkResult = deliveryCheckResults[group.seller_id];
                  return checkResult?.delivers ? checkResult.delivery_price : (group.delivery_price ?? null);
                })()}
              />

              {/* Points usage */}
              {(() => {
                const maxPts = getMaxPoints(group.seller_id, group.total);
                const info = loyaltyBySellerMap[group.seller_id];
                if (!info || info.points_balance <= 0 || maxPts <= 0) return null;
                const used = pointsUsage[group.seller_id] ?? 0;
                const discountRub = used * info.points_to_ruble_rate;
                return (
                  <div className="checkout-points">
                    <div className="checkout-points__toggle">
                      <label className="checkout-points__toggle-left">
                        <div className="checkout-points__switch">
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
                          <span className="checkout-points__switch-track" />
                        </div>
                        <span className="checkout-points__label">Использовать баллы</span>
                      </label>
                      <span className="checkout-points__balance">
                        {info.points_balance} б.
                      </span>
                    </div>
                    {used > 0 && (
                      <div className="checkout-points__slider">
                        <input
                          type="range"
                          className="checkout-points__range"
                          min={0}
                          max={maxPts}
                          step={1}
                          value={used}
                          onChange={(e) => setPointsUsage((prev) => ({
                            ...prev,
                            [group.seller_id]: Number(e.target.value),
                          }))}
                        />
                        <span className="checkout-points__discount">
                          −{formatPrice(discountRub)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Gift note (per seller) */}
              {group.gift_note_enabled && (
                <div className="checkout-gift-note">
                  <span className="checkout-gift-note__label">Записка к цветам</span>
                  <textarea
                    className="checkout-field__input checkout-field__textarea"
                    value={giftNotesBySeller[group.seller_id] || ''}
                    onChange={(e) => setGiftNotesBySeller(prev => ({
                      ...prev,
                      [group.seller_id]: e.target.value,
                    }))}
                    placeholder="Текст записки к букету"
                    rows={2}
                    maxLength={500}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSubmit}>
        {/* ===== Section: Contact Info ===== */}
        <div className="checkout-section">
          <div className="checkout-section__header">
            <h2 className="checkout-section__title">Контактные данные</h2>
          </div>

          {/* Phone: edit mode or missing */}
          {(!user?.phone || editingPhone || (isBrowser() && !user?.phone)) && (
            <div className="checkout-phone-input">
              <p className={`checkout-phone-input__hint ${!user?.phone ? 'checkout-phone-input__hint--warning' : ''}`}>
                {user?.phone ? 'Изменить номер телефона' : 'Для оформления необходим номер телефона'}
              </p>
              <input
                type="tel"
                className="checkout-field__input"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+7 999 123 45 67"
              />
              <div className="checkout-phone-input__actions">
                {!isBrowser() && (
                  <button
                    type="button"
                    className="checkout-btn checkout-btn--primary"
                    onClick={handleRequestContact}
                    disabled={requestingContact}
                  >
                    {requestingContact ? 'Запрос...' : 'Поделиться номером'}
                  </button>
                )}
                <button
                  type="button"
                  className="checkout-btn checkout-btn--primary"
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
                    className="checkout-btn checkout-btn--ghost"
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

          {/* Phone: display mode */}
          {user?.phone && !editingPhone && (
            <div className="checkout-field">
              <span className="checkout-field__label">Телефон</span>
              <div className="checkout-phone">
                <span className="checkout-phone__number">{user.phone}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingPhone(true);
                    setPhoneInput(user.phone ?? '');
                  }}
                  className="checkout-phone__edit"
                >
                  Изменить
                </button>
              </div>
            </div>
          )}

          {/* Name */}
          <div className="checkout-field" style={{ marginTop: 12 }}>
            <span className="checkout-field__label">Имя получателя</span>
            <input
              type="text"
              className="checkout-field__input"
              value={fioInput}
              onChange={(e) => setFioInput(e.target.value)}
              placeholder="ФИО или имя"
            />
          </div>

          {/* Recipient not me */}
          <label className="checkout-checkbox" style={{ marginTop: 16 }}>
            <input
              type="checkbox"
              checked={recipientNotMe}
              onChange={(e) => setRecipientNotMe(e.target.checked)}
            />
            <span>Получатель не я</span>
          </label>
          {recipientNotMe && (
            <div className="checkout-recipient">
              <div className="checkout-field">
                <span className="checkout-field__label checkout-field__label--required">Имя получателя</span>
                <input
                  type="text"
                  className="checkout-field__input"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="ФИО или имя"
                />
              </div>
              <div className="checkout-field" style={{ marginTop: 8 }}>
                <span className="checkout-field__label">Телефон получателя</span>
                <input
                  type="tel"
                  className="checkout-field__input"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder="7 000 000 00 00"
                />
              </div>
            </div>
          )}
        </div>

        {/* ===== Section: Delivery Address ===== */}
        {hasAnyDelivery && (
          <div className="checkout-section">
            <div className="checkout-section__header">
              <h2 className="checkout-section__title">Адрес доставки</h2>
            </div>
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
            {Object.entries(deliveryCheckResults).map(([sid, result]) => (
              <div key={sid} className={`checkout-delivery-status ${result.delivers ? 'checkout-delivery-status--ok' : 'checkout-delivery-status--error'}`}>
                {result.delivers
                  ? (result.delivery_price > 0 ? `Доставка: ${result.delivery_price} \u20BD` : 'Бесплатная доставка')
                  : result.message || 'Магазин не доставляет по этому адресу'}
              </div>
            ))}
          </div>
        )}

        {/* ===== Section: Comment ===== */}
        <div className="checkout-section">
          <div className="checkout-section__header">
            <h2 className="checkout-section__title">Комментарий</h2>
          </div>
          <textarea
            className="checkout-field__input checkout-field__textarea"
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            placeholder="Код домофона, этаж, удобное время, пожелания"
            rows={3}
          />
        </div>

        {/* ===== Totals ===== */}
        <div className="checkout-totals">
          <div className="checkout-totals__row">
            <span className="checkout-totals__label">Товары ({totalItemCount})</span>
            <span className="checkout-totals__value">{formatPrice(totalGoods)}</span>
          </div>
          {totalDelivery > 0 && (
            <div className="checkout-totals__row">
              <span className="checkout-totals__label">Доставка</span>
              <span className="checkout-totals__value">{formatPrice(totalDelivery)}</span>
            </div>
          )}
          {totalPointsDiscount > 0 && (
            <div className="checkout-totals__row">
              <span className="checkout-totals__label">Скидка баллами</span>
              <span className="checkout-totals__value checkout-totals__value--discount">−{formatPrice(totalPointsDiscount)}</span>
            </div>
          )}
          <div className="checkout-totals__divider" />
          <div className="checkout-totals__grand">
            <span className="checkout-totals__grand-label">К оплате</span>
            <span className="checkout-totals__grand-value">{formatPrice(totalToPay)}</span>
          </div>
        </div>

        {/* ===== Submit ===== */}
        <button
          type="submit"
          className="checkout-submit"
          disabled={submitting || !user?.phone || Object.values(deliveryCheckResults).some(r => !r.delivers)}
        >
          {submitting ? 'Оформляем...' : 'Подтвердить заказ'}
        </button>
      </form>
    </div>
    </>
  );
}
