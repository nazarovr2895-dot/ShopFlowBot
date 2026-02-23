import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CartSellerGroup } from '../types';
import { api } from '../api/client';
import { EmptyState, ProductImage, LoyaltyLoginBanner, DesktopBackNav, AddressAutocomplete } from '../components';
import { getGuestCart, guestCartToGroups, clearGuestCart } from '../utils/guestCart';
import './Checkout.css';

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return '';
  let normalized = digits.startsWith('8') ? '7' + digits.slice(1) : digits.startsWith('7') ? digits : '7' + digits;
  normalized = normalized.slice(0, 11);
  return normalized;
}

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
  const [submitting, setSubmitting] = useState(false);
  const [cart, setCart] = useState<CartSellerGroup[]>([]);
  const [buyerDistrictId, setBuyerDistrictId] = useState<number | null>(null);
  const [buyerDistrictName, setBuyerDistrictName] = useState<string | null>(null);
  const [deliveryCheckResults, setDeliveryCheckResults] = useState<Record<number, { delivers: boolean; delivery_price: number; message: string }>>({});
  const [districtNameToId, setDistrictNameToId] = useState<Record<string, number>>({});

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

  const formatPrice = (n: number) =>
    new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);

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
    !hasDeliveryFailure;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalized = normalizePhone(guestPhone);
    if (normalized.length !== 11 || normalized[0] !== '7') {
      alert('Неверный формат телефона. Введите номер в формате +7...');
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
      }));

      const { orders } = await api.guestCheckout({
        guest_name: guestName.trim() || 'Покупатель',
        guest_phone: normalized,
        delivery_type: 'Самовывоз', // fallback (per-seller overrides take precedence)
        address: hasAnyDelivery ? address.trim() : 'Самовывоз',
        comment: comment.trim() || undefined,
        items: allItems,
        delivery_by_seller: deliveryArr,
        buyer_district_id: buyerDistrictId,
        buyer_district_name: buyerDistrictName,
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

      {/* Order summary */}
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
          </div>
          );
        })}
        <div className="checkout-summary__grand-total">
          К оплате: {formatPrice(totalToPay)}
        </div>
      </div>

      {/* Checkout form */}
      <form className="checkout-form" onSubmit={handleSubmit}>
        <label className="checkout-form__label">
          Имя получателя *
          <input
            type="text"
            className="checkout-form__input"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="ФИО или имя"
            required
          />
        </label>

        <label className="checkout-form__label">
          Телефон *
          <input
            type="tel"
            className="checkout-form__input"
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            placeholder="+7 999 123 45 67"
            required
          />
        </label>

        {hasAnyDelivery && (
          <div className="checkout-form__label">
            Адрес доставки *
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
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Код домофона, этаж, удобное время, пожелания"
            rows={3}
          />
        </label>

        <button
          type="submit"
          className="checkout-form__submit"
          disabled={submitting || !canSubmit}
        >
          {submitting ? 'Оформляем...' : 'Подтвердить заказ'}
        </button>
      </form>
    </div>
    </>
  );
}
