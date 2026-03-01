import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CartSellerGroup } from '../types';
import { api } from '../api/client';
import { EmptyState, LoyaltyLoginBanner, DesktopBackNav, AddressAutocomplete } from '../components';
import { DeliverySlotPicker } from '../components/DeliverySlotPicker';
import type { DeliverySlot } from '../components/DeliverySlotPicker';
import { DeliveryTypeToggle } from '../components/checkout/DeliveryTypeToggle';
import { OrderItemsSection } from '../components/checkout/OrderItemsSection';
import { getGuestCart, guestCartToGroups, clearGuestCart } from '../utils/guestCart';
import { formatPrice } from '../utils/formatters';
import { normalizePhone } from '../utils/phone';
import './Checkout.css';

export function GuestCheckout() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterSellerId = searchParams.get('seller') ? Number(searchParams.get('seller')) : null;
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [deliveryBySeller, setDeliveryBySeller] = useState<Record<number, 'Доставка' | 'Самовывоз'>>({});
  const [address, setAddress] = useState('');
  const [comment, setComment] = useState('');
  const [recipientNotMe, setRecipientNotMe] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [giftNotesBySeller, setGiftNotesBySeller] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [cart, setCart] = useState<CartSellerGroup[]>([]);
  const [buyerDistrictId, setBuyerDistrictId] = useState<number | null>(null);
  const [buyerDistrictName, setBuyerDistrictName] = useState<string | null>(null);
  const [deliveryCheckResults, setDeliveryCheckResults] = useState<Record<number, { delivers: boolean; delivery_price: number; district_id?: number | null; message: string }>>({});
  const [districtNameToId, setDistrictNameToId] = useState<Record<string, number>>({});
  const [slotsBySeller, setSlotsBySeller] = useState<Record<number, DeliverySlot | null>>({});
  const [paymentMethodBySeller, setPaymentMethodBySeller] = useState<Record<number, 'online' | 'on_pickup'>>({});

  useEffect(() => {
    let items = getGuestCart();
    if (filterSellerId) {
      items = items.filter((i) => i.seller_id === filterSellerId);
    }
    if (items.length === 0) {
      navigate(filterSellerId ? `/shop/${filterSellerId}` : '/', { replace: true });
      return;
    }
    const groups = guestCartToGroups(items);
    setCart(groups);

    // Initialize delivery type per seller based on their capabilities
    setDeliveryBySeller((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        if (next[g.seller_id]) continue;
        if (g.delivery_type === 'pickup') {
          next[g.seller_id] = 'Самовывоз';
        } else if (g.delivery_type === 'delivery') {
          next[g.seller_id] = 'Доставка';
        } else {
          next[g.seller_id] = 'Самовывоз';
        }
      }
      return next;
    });
  }, [navigate]);

  // Load districts for delivery zone matching based on sellers' cities
  useEffect(() => {
    const cityIds = [...new Set(cart.map(g => g.city_id).filter((id): id is number => id != null))];
    if (cityIds.length === 0 && cart.length > 0) cityIds.push(1); // fallback to Moscow
    if (cityIds.length === 0) return;
    Promise.all(cityIds.map(id => api.getDistrictsByCityId(id))).then((allDistricts) => {
      const nameMap: Record<string, number> = {};
      for (const districts of allDistricts) {
        for (const d of districts) nameMap[d.name] = d.id;
      }
      setDistrictNameToId(nameMap);
    }).catch(() => { /* not critical */ });
  }, [cart]);

  const totalGoods = cart.reduce((sum, g) => sum + g.total, 0);
  // Prefer zone price from delivery check over flat cart price
  const totalDelivery = cart.reduce((sum, g) => {
    if (deliveryBySeller[g.seller_id] !== 'Доставка') return sum;
    const checkResult = deliveryCheckResults[g.seller_id];
    if (checkResult?.delivers) return sum + checkResult.delivery_price;
    return sum + (g.delivery_price ?? 0);
  }, 0);
  const totalToPay = totalGoods + totalDelivery;
  const totalItemCount = cart.reduce((s, g) => s + g.items.length, 0);
  const hasAnyDelivery = Object.values(deliveryBySeller).some((d) => d === 'Доставка');

  const itemCountLabel = (n: number) => {
    if (n === 1) return '1 товар';
    if (n >= 2 && n <= 4) return `${n} товара`;
    return `${n} товаров`;
  };

  const hasDeliveryFailure = Object.values(deliveryCheckResults).some(r => !r.delivers);
  const canSubmit = guestPhone.trim().length > 0 &&
    guestName.trim().length > 0 &&
    (!hasAnyDelivery || address.trim().length > 0) &&
    !hasDeliveryFailure &&
    (!recipientNotMe || recipientName.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalized = normalizePhone(guestPhone);
    if (normalized.length !== 11 || normalized[0] !== '7') {
      alert('Неверный формат телефона. Введите номер в формате +7...');
      return;
    }
    if (recipientNotMe && !recipientName.trim()) {
      alert('Укажите имя получателя');
      return;
    }
    if (hasAnyDelivery && !address.trim()) {
      alert('Укажите адрес доставки');
      return;
    }

    // Block submit if any seller doesn't deliver to the address
    const failedDelivery = Object.entries(deliveryCheckResults).find(([, r]) => !r.delivers);
    if (failedDelivery) {
      alert(failedDelivery[1].message || 'Один из магазинов не доставляет по этому адресу');
      return;
    }

    setSubmitting(true);
    try {
      const allItems = getGuestCart().map((i) => ({
        product_id: i.product_id,
        seller_id: i.seller_id,
        quantity: i.quantity,
        name: i.name,
        price: i.price,
      }));

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

      const { orders } = await api.guestCheckout({
        guest_name: guestName.trim() || 'Покупатель',
        guest_phone: normalized,
        delivery_type: 'Самовывоз', // fallback (per-seller overrides take precedence)
        address: hasAnyDelivery ? address.trim() : 'Самовывоз',
        comment: comment.trim() || undefined,
        items: allItems,
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

      clearGuestCart();
      navigate('/order/guest-confirm', {
        state: { orders, guest_phone: normalized },
        replace: true,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка оформления заказа');
    } finally {
      setSubmitting(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="checkout-page">
        <h1 className="checkout-page__title">Оформление заказа</h1>
        <EmptyState
          title="Корзина пуста"
          description="Добавьте товары в корзину и вернитесь к оформлению"
          icon="🛒"
        />
      </div>
    );
  }

  return (
    <>
    <DesktopBackNav title="Оформление заказа" />
    <div className="checkout-page">
      <h1 className="checkout-page__title">Оформление заказа</h1>

      {!bannerDismissed && (
        <LoyaltyLoginBanner
          onDismiss={() => setBannerDismissed(true)}
          onLogin={() => navigate('/profile?from=checkout')}
        />
      )}

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

      {/* ===== Form ===== */}
      <form onSubmit={handleSubmit}>
        {/* ===== Section: Contact Info ===== */}
        <div className="checkout-section">
          <div className="checkout-section__header">
            <h2 className="checkout-section__title">Контактные данные</h2>
          </div>

          <div className="checkout-field">
            <span className="checkout-field__label checkout-field__label--required">Имя получателя</span>
            <input
              type="text"
              className="checkout-field__input"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="ФИО или имя"
              required
            />
          </div>

          <div className="checkout-field" style={{ marginTop: 12 }}>
            <span className="checkout-field__label checkout-field__label--required">Телефон</span>
            <input
              type="tel"
              className="checkout-field__input"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="+7 999 123 45 67"
              required
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
              required
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
            value={comment}
            onChange={(e) => setComment(e.target.value)}
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
          disabled={submitting || !canSubmit}
        >
          {submitting ? 'Оформляем...' : 'Подтвердить заказ'}
        </button>
      </form>
    </div>
    </>
  );
}
