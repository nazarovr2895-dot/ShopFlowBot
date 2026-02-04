import { useNavigate } from 'react-router-dom';
import type { PublicSellerListItem } from '../types';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import './ShopCard.css';

interface ShopCardProps {
  seller: PublicSellerListItem;
}

export function ShopCard({ seller }: ShopCardProps) {
  const navigate = useNavigate();
  const { hapticFeedback } = useTelegramWebApp();

  const handleClick = () => {
    hapticFeedback('light');
    navigate(`/shop/${seller.seller_id}`);
  };

  const formatPrice = (price: number | null) => {
    if (price === null) return '—';
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const getDeliveryLabel = (type: string | null, deliveryPrice: number) => {
    switch (type) {
      case 'delivery':
        return deliveryPrice === 0 ? 'Доставка (бесплатно)' : `Доставка (${formatPrice(deliveryPrice)})`;
      case 'pickup':
        return 'Самовывоз';
      case 'both':
        const deliveryText = deliveryPrice === 0 ? 'бесплатно' : formatPrice(deliveryPrice);
        return `Доставка (${deliveryText}) / Самовывоз`;
      default:
        return 'Не указано';
    }
  };

  const priceRange =
    seller.min_price !== null && seller.max_price !== null
      ? seller.min_price === seller.max_price
        ? formatPrice(seller.min_price)
        : `${formatPrice(seller.min_price)} – ${formatPrice(seller.max_price)}`
      : 'Нет товаров';

  const renderLocation = () => {
    const parts: React.ReactNode[] = [];
    if (seller.district_name) parts.push(seller.district_name);
    if (seller.metro_name) {
      parts.push(
        <span key="metro" className="shop-card__metro">
          {seller.metro_line_color && (
            <span
              className="shop-card__metro-line"
              style={{ backgroundColor: seller.metro_line_color }}
              aria-hidden
            />
          )}
          <span className="shop-card__metro-name">{seller.metro_name}</span>
          {seller.metro_walk_minutes != null && seller.metro_walk_minutes > 0 && (
            <span className="shop-card__metro-walk">
              🚶 {seller.metro_walk_minutes} мин
            </span>
          )}
        </span>,
      );
    }
    if (parts.length === 0) return 'Локация не указана';
    return parts.reduce<React.ReactNode[]>(
      (acc, part, i) => (i === 0 ? [part] : [...acc, ' • ', part]),
      [],
    );
  };

  return (
    <div className="shop-card" onClick={handleClick}>
      <div className="shop-card__header">
        <h3 className="shop-card__name">{seller.shop_name || 'Без названия'}</h3>
        <span className={`shop-card__slots ${seller.available_slots <= 2 ? 'low' : ''}`}>
          {seller.available_slots} слотов
        </span>
      </div>

      {seller.owner_fio && (
        <div className="shop-card__owner">{seller.owner_fio}</div>
      )}

      <div className="shop-card__location">
        {renderLocation()}
      </div>

      <div className="shop-card__footer">
        <div className="shop-card__price">{priceRange}</div>
        <div className="shop-card__delivery">{getDeliveryLabel(seller.delivery_type, seller.delivery_price)}</div>
      </div>

      <div className="shop-card__products">
        {seller.product_count} {getProductWord(seller.product_count)}
      </div>
    </div>
  );
}

function getProductWord(count: number): string {
  const lastTwo = count % 100;
  const lastOne = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) return 'товаров';
  if (lastOne === 1) return 'товар';
  if (lastOne >= 2 && lastOne <= 4) return 'товара';
  return 'товаров';
}
