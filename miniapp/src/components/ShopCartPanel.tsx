import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Product, CartItemEntry } from '../types';
import WebApp from '@twa-dev/sdk';
import { useShopCart } from '../contexts/ShopCartContext';
import { useDesktopLayout } from '../hooks/useDesktopLayout';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { isTelegram, isBrowser } from '../utils/environment';
import { api } from '../api/client';
import { ProductImage } from './ProductImage';
import { ProductModal } from './ProductModal';
import { ReservationBadge } from './ReservationBadge';
import { formatPrice } from '../utils/formatters';
import './ShopCartPanel.css';

const SWIPE_THRESHOLD = 120;

const itemCountLabel = (n: number) => {
  const lastTwo = n % 100;
  const lastOne = n % 10;
  if (lastTwo >= 11 && lastTwo <= 19) return `${n} товаров`;
  if (lastOne === 1) return `${n} товар`;
  if (lastOne >= 2 && lastOne <= 4) return `${n} товара`;
  return `${n} товаров`;
};

export function ShopCartPanel() {
  const {
    sellerId,
    items,
    total,
    itemCount,
    deliveryPrice,
    isPanelOpen,
    setPanelOpen,
    updateQuantity,
    removeItem,
    extendReservation,
    refreshCart,
    addonProducts,
    addonCategories,
    addItem,
  } = useShopCart();

  const navigate = useNavigate();
  const isDesktop = useDesktopLayout();
  const { hapticFeedback, showAlert } = useTelegramWebApp();
  const [closing, setClosing] = useState(false);
  const [selectedAddonProduct, setSelectedAddonProduct] = useState<Product | null>(null);
  const [selectedCartProduct, setSelectedCartProduct] = useState<Product | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, startY: 0, currentY: 0 });

  const isGuest = isBrowser() && !api.isAuthenticated();

  /* ─── Close helper ─────────────────────────── */
  const closePanel = useCallback(() => {
    setClosing(true);
  }, []);

  const handleAnimationEnd = useCallback((e: React.AnimationEvent) => {
    if (e.target !== e.currentTarget) return;
    if (closing) {
      setClosing(false);
      setPanelOpen(false);
    }
  }, [closing, setPanelOpen]);

  /* ─── Scroll lock + ESC + Telegram swipe guard */
  useEffect(() => {
    if (!isPanelOpen) return;

    setClosing(false);
    const html = document.documentElement;
    html.classList.add('scroll-locked');

    if (isTelegram()) {
      try { WebApp.disableVerticalSwipes(); } catch { /* ignore */ }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      html.classList.remove('scroll-locked');
      document.removeEventListener('keydown', onKey);
      if (isTelegram()) {
        try { WebApp.enableVerticalSwipes(); } catch { /* ignore */ }
      }
    };
  }, [isPanelOpen, closePanel]);

  /* ─── Swipe-to-dismiss (mobile only) ────────── */
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isDesktop) return;
    dragRef.current = { active: true, startY: e.touches[0].clientY, currentY: e.touches[0].clientY };
  }, [isDesktop]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current.active || isDesktop) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - dragRef.current.startY;
    dragRef.current.currentY = currentY;

    if (deltaY > 0 && panelRef.current) {
      panelRef.current.style.transform = `translateY(${deltaY}px)`;
    }
  }, [isDesktop]);

  const handleTouchEnd = useCallback(() => {
    if (!dragRef.current.active || isDesktop) return;
    const deltaY = dragRef.current.currentY - dragRef.current.startY;
    dragRef.current.active = false;

    if (panelRef.current) {
      if (deltaY > SWIPE_THRESHOLD) {
        closePanel();
      }
      panelRef.current.style.transform = '';
    }
  }, [isDesktop, closePanel]);

  /* ─── Handlers ─────────────────────────────── */
  const handleUpdateQuantity = useCallback(async (productId: number, newQty: number) => {
    hapticFeedback('light');
    await updateQuantity(productId, newQty);
  }, [updateQuantity, hapticFeedback]);

  const handleRemoveItem = useCallback(async (productId: number) => {
    hapticFeedback('medium');
    await removeItem(productId);
  }, [removeItem, hapticFeedback]);

  const handleExtendReservation = useCallback(async (productId: number) => {
    try {
      hapticFeedback('light');
      await extendReservation(productId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      if (msg.includes('409') || msg.includes('истекло')) {
        showAlert('Резервирование истекло. Обновляем корзину...');
        await refreshCart();
      } else {
        showAlert(msg);
      }
    }
  }, [extendReservation, hapticFeedback, showAlert, refreshCart]);

  const handleReservationExpired = useCallback(() => {
    showAlert('Время резервирования истекло, товар убран из корзины');
  }, [showAlert]);

  const handleCheckout = useCallback(() => {
    hapticFeedback('medium');
    closePanel();
    const path = isGuest
      ? `/cart/guest-checkout?seller=${sellerId}`
      : `/cart/checkout?seller=${sellerId}`;
    navigate(path);
  }, [hapticFeedback, closePanel, isGuest, sellerId, navigate]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closePanel();
  }, [closePanel]);

  const handleCartItemClick = useCallback(async (item: CartItemEntry) => {
    try {
      const product = await api.getProduct(item.product_id);
      setSelectedCartProduct(product);
    } catch { /* ignore */ }
  }, []);

  if (!isPanelOpen) return null;

  const grandTotal = total + (deliveryPrice ?? 0);

  return (
    <div
      ref={overlayRef}
      className={`shop-cart-panel-overlay ${closing ? 'shop-cart-panel-overlay--closing' : ''} ${isDesktop ? 'shop-cart-panel-overlay--desktop' : ''}`}
      onClick={handleOverlayClick}
      onAnimationEnd={handleAnimationEnd}
    >
      <div
        ref={panelRef}
        className={`shop-cart-panel ${closing ? 'shop-cart-panel--closing' : ''} ${isDesktop ? 'shop-cart-panel--desktop' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle for swipe (mobile) */}
        {!isDesktop && <div className="shop-cart-panel__handle" />}

        {/* Header */}
        <div className="shop-cart-panel__header">
          <h2 className="shop-cart-panel__title">Корзина</h2>
          <span className="shop-cart-panel__count">{itemCountLabel(itemCount)}</span>
          <button
            type="button"
            className="shop-cart-panel__close"
            onClick={closePanel}
            aria-label="Закрыть"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Items list */}
        <div className="shop-cart-panel__items">
          {items.map((item) => (
            <div key={item.product_id} className="shop-cart-panel__item">
              <div className="shop-cart-panel__item-image" style={{ cursor: 'pointer' }} onClick={() => handleCartItemClick(item)}>
                <ProductImage
                  src={api.getProductImageUrl(item.photo_id ?? null)}
                  alt={item.name}
                  className="shop-cart-panel__item-img"
                  placeholderClassName="shop-cart-panel__item-img-placeholder"
                />
              </div>
              <div className="shop-cart-panel__item-body">
                <div style={{ cursor: 'pointer' }} onClick={() => handleCartItemClick(item)}>
                  <span className="shop-cart-panel__item-price">{formatPrice(item.price)}</span>
                  <span className="shop-cart-panel__item-name">{item.name}</span>
                </div>
                {item.is_preorder && item.preorder_delivery_date && (
                  <span className="shop-cart-panel__item-preorder">
                    Предзаказ на {new Date(item.preorder_delivery_date).toLocaleDateString('ru-RU')}
                  </span>
                )}
                <ReservationBadge
                  item={item}
                  onExpired={handleReservationExpired}
                  onExtend={handleExtendReservation}
                />
                <div className="shop-cart-panel__item-row">
                  <button
                    type="button"
                    className="shop-cart-panel__item-remove"
                    onClick={() => handleRemoveItem(item.product_id)}
                    aria-label="Удалить"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                  <div className="shop-cart-panel__item-qty">
                    <button
                      type="button"
                      className="shop-cart-panel__item-qty-btn"
                      onClick={() => handleUpdateQuantity(item.product_id, item.quantity - 1)}
                    >
                      −
                    </button>
                    <span className="shop-cart-panel__item-qty-num">{item.quantity}</span>
                    <button
                      type="button"
                      className="shop-cart-panel__item-qty-btn"
                      onClick={() => handleUpdateQuantity(item.product_id, item.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                  <span className="shop-cart-panel__item-total">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Cross-sell: Добавить к букету */}
        {addonCategories.length > 0 && (() => {
          const cartProductIds = new Set(items.map((i) => i.product_id));
          const availableAddons = addonProducts.filter((p) => !cartProductIds.has(p.id));
          if (availableAddons.length === 0) return null;
          return (
            <div className="shop-cart-panel__addons">
              <h3 className="shop-cart-panel__addons-title">Добавить к букету</h3>
              {addonCategories.map((cat) => {
                const catProducts = availableAddons.filter((p) => p.category_id === cat.id);
                if (catProducts.length === 0) return null;
                return (
                  <div key={cat.id} className="shop-cart-panel__addon-row">
                    <span className="shop-cart-panel__addon-category-name">{cat.name}</span>
                    <div className="shop-cart-panel__addon-scroll">
                      {catProducts.map((p) => {
                        const firstPhotoId = (p.photo_ids && p.photo_ids[0]) || p.photo_id;
                        const imageUrl = api.getProductImageUrl(firstPhotoId ?? null);
                        return (
                          <div key={p.id} className="shop-cart-panel__addon-card" onClick={() => setSelectedAddonProduct(p)}>
                            <div className="shop-cart-panel__addon-card-image">
                              <ProductImage
                                src={imageUrl}
                                alt={p.name}
                                className="shop-cart-panel__addon-card-img"
                                placeholderClassName="shop-cart-panel__addon-card-img-placeholder"
                              />
                            </div>
                            <span className="shop-cart-panel__addon-card-name">{p.name}</span>
                            <span className="shop-cart-panel__addon-card-price">{formatPrice(p.price)}</span>
                            <button
                              type="button"
                              className="shop-cart-panel__addon-card-add"
                              onClick={async (e) => {
                                e.stopPropagation();
                                hapticFeedback('light');
                                try {
                                  await addItem({ product: { id: p.id, name: p.name, price: p.price, photo_id: firstPhotoId } });
                                } catch { /* ignore */ }
                              }}
                            >
                              +
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Footer */}
        <div className="shop-cart-panel__footer">
          <div className="shop-cart-panel__summary">
            <div className="shop-cart-panel__summary-row">
              <span>Товары ({itemCount})</span>
              <span>{formatPrice(total)}</span>
            </div>
            {deliveryPrice === null ? (
              <div className="shop-cart-panel__summary-row">
                <span>Доставка</span>
                <span style={{ color: 'var(--tg-theme-hint-color, #999)', fontSize: '0.85em' }}>зависит от адреса</span>
              </div>
            ) : deliveryPrice > 0 ? (
              <div className="shop-cart-panel__summary-row">
                <span>Доставка</span>
                <span>{formatPrice(deliveryPrice)}</span>
              </div>
            ) : null}
            <div className="shop-cart-panel__summary-row shop-cart-panel__summary-row--total">
              <span>{deliveryPrice !== null && deliveryPrice > 0 ? 'При доставке' : 'К оплате'}</span>
              <span>{formatPrice(deliveryPrice !== null && deliveryPrice > 0 ? grandTotal : total)}</span>
            </div>
          </div>
          <button
            type="button"
            className="shop-cart-panel__checkout-btn"
            onClick={handleCheckout}
          >
            Оформить заказ
          </button>
          {!isGuest && (
            <p className="shop-cart-panel__note">Товары бронируются на 7 минут</p>
          )}
        </div>
      </div>

      {selectedCartProduct && (
        <ProductModal
          product={selectedCartProduct}
          isOpen={!!selectedCartProduct}
          onClose={() => setSelectedCartProduct(null)}
          onAddToCart={() => setSelectedCartProduct(null)}
          isFavorite={false}
          onToggleFavorite={() => {}}
          isAdding={false}
          inStock={true}
          isPreorder={!!selectedCartProduct.is_preorder}
          currentCartQuantity={items.find(i => i.product_id === selectedCartProduct.id)?.quantity}
          onUpdateCart={(qty) => { updateQuantity(selectedCartProduct.id, qty); setSelectedCartProduct(null); }}
          sellerId={sellerId}
        />
      )}

      {selectedAddonProduct && (
        <ProductModal
          product={selectedAddonProduct}
          isOpen={!!selectedAddonProduct}
          onClose={() => setSelectedAddonProduct(null)}
          onAddToCart={async (quantity: number) => {
            const p = selectedAddonProduct;
            const firstPhotoId = (p.photo_ids && p.photo_ids[0]) || p.photo_id;
            try {
              for (let i = 0; i < quantity; i++) {
                await addItem({ product: { id: p.id, name: p.name, price: p.price, photo_id: firstPhotoId } });
              }
            } catch { /* ignore */ }
            setSelectedAddonProduct(null);
          }}
          isFavorite={false}
          onToggleFavorite={() => {}}
          isAdding={false}
          inStock={true}
          isPreorder={false}
          sellerId={sellerId}
        />
      )}
    </div>
  );
}
