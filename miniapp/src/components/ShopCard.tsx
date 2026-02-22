import { useNavigate } from 'react-router-dom';
import type { PublicSellerListItem } from '../types';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import './ShopCard.css';

interface ShopCardProps {
  seller: PublicSellerListItem;
}

// Icons for service tags
const TruckIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13" />
    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
);

const BagIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

const MetroIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const ProductsIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

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

  const priceRange =
    seller.min_price !== null && seller.max_price !== null
      ? seller.min_price === seller.max_price
        ? formatPrice(seller.min_price)
        : (
            <>
              <span className="shop-card__price-from">От {formatPrice(seller.min_price)}</span>
              {' '}до {formatPrice(seller.max_price)}
            </>
          )
      : 'Нет товаров';

  const getProductWord = (count: number): string => {
    const lastTwo = count % 100;
    const lastOne = count % 10;

    if (lastTwo >= 11 && lastTwo <= 14) return 'товаров';
    if (lastOne === 1) return 'товар';
    if (lastOne >= 2 && lastOne <= 4) return 'товара';
    return 'товаров';
  };

  // Determine which service tags to show
  const showDelivery = seller.delivery_type === 'delivery' || seller.delivery_type === 'both';
  const showPickup = seller.delivery_type === 'pickup' || seller.delivery_type === 'both';

  return (
    <div className="shop-card" onClick={handleClick}>
      <div className="shop-card__header">
        <h3 className="shop-card__name">{seller.shop_name || 'Без названия'}</h3>
      </div>

      {seller.owner_fio && (
        <div className="shop-card__owner">Владелец: {seller.owner_fio}</div>
      )}

      {(showDelivery || showPickup) && (
        <div className="shop-card__services">
          {showDelivery && (
            <span className="shop-card__service-tag shop-card__service-tag--delivery">
              <TruckIcon className="shop-card__service-icon" />
              Доставка
            </span>
          )}
          {showPickup && (
            <span className="shop-card__service-tag shop-card__service-tag--pickup">
              <BagIcon className="shop-card__service-icon" />
              Самовывоз
            </span>
          )}
        </div>
      )}

      <div className="shop-card__info-row">
        {seller.metro_name && (
          <span className="shop-card__location">
            <MetroIcon className="shop-card__info-icon" />
            М. {seller.metro_name}
          </span>
        )}
        <span className="shop-card__products">
          <ProductsIcon className="shop-card__info-icon" />
          {seller.product_count} {getProductWord(seller.product_count)}
        </span>
      </div>

      <div className="shop-card__footer">
        <div className="shop-card__price">{priceRange}</div>
        <div className="shop-card__availability-row">
          {(seller.availability ?? (seller.available_slots > 0 ? 'available' : 'busy')) === 'busy' ? (
            <span className="shop-card__availability shop-card__availability--busy">Занят</span>
          ) : (
            <span className="shop-card__availability shop-card__availability--available">Принимает</span>
          )}
        </div>
      </div>
    </div>
  );
}
