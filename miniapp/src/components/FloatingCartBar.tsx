import { useShopCart } from '../contexts/ShopCartContext';
import { useDesktopLayout } from '../hooks/useDesktopLayout';
import './FloatingCartBar.css';

const CartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);

const formatPrice = (n: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);

const itemCountLabel = (n: number) => {
  const lastTwo = n % 100;
  const lastOne = n % 10;
  if (lastTwo >= 11 && lastTwo <= 19) return `${n} товаров`;
  if (lastOne === 1) return `${n} товар`;
  if (lastOne >= 2 && lastOne <= 4) return `${n} товара`;
  return `${n} товаров`;
};

export function FloatingCartBar() {
  const { itemCount, total, setPanelOpen } = useShopCart();
  const isDesktop = useDesktopLayout();

  if (itemCount === 0) return null;

  return (
    <div
      className={`floating-cart-bar ${isDesktop ? 'floating-cart-bar--desktop' : ''}`}
      onClick={() => setPanelOpen(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPanelOpen(true); } }}
    >
      <div className="floating-cart-bar__left">
        <span className="floating-cart-bar__icon"><CartIcon /></span>
        <span className="floating-cart-bar__info">
          <span className="floating-cart-bar__count">{itemCountLabel(itemCount)}</span>
          <span className="floating-cart-bar__dot">&middot;</span>
          <span className="floating-cart-bar__total">{formatPrice(total)}</span>
        </span>
      </div>
      <span className="floating-cart-bar__action">
        Корзина
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </span>
    </div>
  );
}
