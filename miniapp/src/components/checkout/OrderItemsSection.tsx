import type { CartItemEntry } from '../../types';
import { ProductImage } from '../index';
import { api } from '../../api/client';
import { formatPrice } from '../../utils/formatters';

export interface OrderItemsSectionProps {
  items: CartItemEntry[];
  groupTotal: number;
  /** Current delivery type for this seller group. */
  deliveryType: string;
  /** Delivery price from zone check or cart (null = not yet resolved). */
  deliveryPrice: number | null;
}

export function OrderItemsSection({
  items,
  groupTotal,
  deliveryType,
  deliveryPrice,
}: OrderItemsSectionProps) {
  return (
    <>
      {/* Items */}
      <ul className="checkout-items">
        {items.map((item) => (
          <li key={item.product_id} className="checkout-item">
            <div className="checkout-item__image-wrap">
              <ProductImage
                src={api.getProductImageUrl(item.photo_id ?? null)}
                alt={item.name}
                className="checkout-item__image"
                placeholderClassName="checkout-item__image-placeholder"
                placeholderIconClassName="checkout-item__image-placeholder-icon"
              />
            </div>
            <div className="checkout-item__body">
              <span className="checkout-item__name">{item.name}</span>
              <div className="checkout-item__meta">
                <span className="checkout-item__qty">{item.quantity} шт</span>
                <span className="checkout-item__price">{formatPrice(item.price * item.quantity)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Subtotal */}
      <div className="checkout-seller__subtotal">
        Итого: {formatPrice(groupTotal)}
        {deliveryType === 'Доставка' && (() => {
          if (deliveryPrice !== null && deliveryPrice > 0) return <span> + доставка {formatPrice(deliveryPrice)}</span>;
          if (deliveryPrice === null) return <span className="checkout-seller__subtotal-delivery"> + доставка уточняется</span>;
          return null;
        })()}
      </div>
    </>
  );
}
