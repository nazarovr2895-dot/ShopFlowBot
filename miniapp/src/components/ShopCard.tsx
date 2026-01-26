import type { PublicSellerListItem } from '../types';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import './ShopCard.css';

interface ShopCardProps {
  seller: PublicSellerListItem;
}

export function ShopCard({ seller }: ShopCardProps) {
  const { openShop, hapticFeedback } = useTelegramWebApp();

  const handleClick = () => {
    hapticFeedback('light');
    openShop(seller.seller_id);
  };

  const formatPrice = (price: number | null) => {
    if (price === null) return '—';
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const getDeliveryLabel = (type: string | null) => {
    switch (type) {
      case 'delivery':
        return 'Доставка';
      case 'pickup':
        return 'Самовывоз';
      case 'both':
        return 'Доставка / Самовывоз';
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
        {[seller.metro_name, seller.district_name].filter(Boolean).join(' • ') || 'Локация не указана'}
      </div>

      <div className="shop-card__footer">
        <div className="shop-card__price">{priceRange}</div>
        <div className="shop-card__delivery">{getDeliveryLabel(seller.delivery_type)}</div>
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
