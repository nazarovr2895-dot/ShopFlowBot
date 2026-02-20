import { useEffect, useState, useRef, useCallback } from 'react';
import WebApp from '@twa-dev/sdk';
import type { Product } from '../types';
import { ProductImage } from './ProductImage';
import { HeartIcon } from './HeartIcon';
import { ImageViewer } from './ImageViewer';
import { ProductComposition } from './ProductComposition';
import { api } from '../api/client';
import { isTelegram } from '../utils/environment';
import './ProductModal.css';

interface ProductModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: (e: React.MouseEvent) => void;
  onAddToCart: (quantity: number) => void;
  isAdding: boolean;
  inStock: boolean;
  isPreorder: boolean;
  availableDates?: string[];
  onSelectPreorderDate?: (date: string) => void;
  showDatePicker?: boolean;
  onCancelDatePicker?: () => void;
  deliveryPrice?: number;
  deliveryType?: 'delivery' | 'pickup' | 'both' | null;
  loyaltyPointsPercent?: number;
  pointsBalance?: number;
  pointsToRubleRate?: number;
  maxPointsDiscountPercent?: number;
  loyaltyLinked?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Swipe-to-dismiss helpers (ref-based, zero re-renders)             */
/* ------------------------------------------------------------------ */
interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  currentY: number;
  direction: 'none' | 'horizontal' | 'vertical';
}

const SWIPE_THRESHOLD = 120;

export function ProductModal({
  product,
  isOpen,
  onClose,
  isFavorite,
  onToggleFavorite,
  onAddToCart,
  isAdding,
  inStock,
  isPreorder,
  availableDates = [],
  onSelectPreorderDate,
  showDatePicker,
  onCancelDatePicker,
  deliveryPrice = 0,
  deliveryType,
  loyaltyPointsPercent = 0,
  pointsBalance = 0,
  pointsToRubleRate = 1,
  maxPointsDiscountPercent = 100,
  loyaltyLinked = false,
}: ProductModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState>({ active: false, startX: 0, startY: 0, currentY: 0, direction: 'none' });
  const scrollRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  const images =
    product.photo_ids && product.photo_ids.length > 0
      ? product.photo_ids
      : product.photo_id
        ? [product.photo_id]
        : [];

  /* ---------- carousel helpers ---------- */
  const scrollToIndex = useCallback((index: number) => {
    const el = carouselRef.current;
    if (!el) return;
    const child = el.children[index] as HTMLElement;
    if (child) {
      el.scrollTo({ left: child.offsetLeft, behavior: 'smooth' });
    }
  }, []);

  const handleCarouselScroll = useCallback(() => {
    const el = carouselRef.current;
    if (!el || images.length <= 1) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setCurrentImageIndex(Math.max(0, Math.min(idx, images.length - 1)));
  }, [images.length]);

  /* ---------- close helpers ---------- */
  // When closing animation ends on the overlay → actually unmount
  // IMPORTANT: check e.target === e.currentTarget to ignore bubbled events from children
  const handleAnimationEnd = useCallback((e: React.AnimationEvent) => {
    if (e.target !== e.currentTarget) return;
    if (closing) {
      setClosing(false);
      onClose();
    }
  }, [closing, onClose]);

  /* ---------- scroll lock + ESC + Telegram swipe guard ---------- */
  useEffect(() => {
    if (!isOpen) return;

    // Reset state for fresh open
    setCurrentImageIndex(0);
    setClosing(false);
    setQuantity(1);

    const html = document.documentElement;
    html.classList.add('scroll-locked');

    // Prevent Telegram from closing the Mini App on swipe-down
    if (isTelegram()) {
      try { WebApp.disableVerticalSwipes(); } catch { /* ignore */ }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setClosing(true);
    };
    document.addEventListener('keydown', onKey);

    return () => {
      html.classList.remove('scroll-locked');
      document.removeEventListener('keydown', onKey);
      // Re-enable Telegram swipe-to-close when modal closes
      if (isTelegram()) {
        try { WebApp.enableVerticalSwipes(); } catch { /* ignore */ }
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  /* ---------- quantity helpers ---------- */
  const handleDecrement = () => { if (quantity > 1) setQuantity(q => q - 1); };
  const handleIncrement = () => {
    if (!isPreorder && product.quantity != null && quantity >= product.quantity) return;
    setQuantity(q => q + 1);
  };

  /* ---------- computed values ---------- */
  const totalPrice = product.price * quantity;
  const formatTotal = (n: number) => n.toLocaleString('ru-RU');

  const pointsEarned = loyaltyPointsPercent > 0 && loyaltyLinked
    ? Math.floor(totalPrice * loyaltyPointsPercent / 100)
    : 0;

  const rate = pointsToRubleRate;
  const maxDiscountRub = totalPrice * (maxPointsDiscountPercent / 100);
  const maxPointsByDiscount = rate > 0 ? Math.floor(maxDiscountRub / rate) : 0;
  const redeemablePoints = Math.min(pointsBalance, maxPointsByDiscount);
  const redeemableRub = redeemablePoints * rate;

  const hasDelivery = deliveryType === 'delivery' || deliveryType === 'both';
  const deliveryCostLabel = hasDelivery
    ? (deliveryPrice === 0 ? 'бесплатно' : `${deliveryPrice.toLocaleString('ru-RU')} ₽`)
    : null;

  /* ---------- backdrop click ---------- */
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setClosing(true);
  };

  /* ---------- image nav ---------- */
  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newIdx = (currentImageIndex - 1 + images.length) % images.length;
    setCurrentImageIndex(newIdx);
    scrollToIndex(newIdx);
  };
  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newIdx = (currentImageIndex + 1) % images.length;
    setCurrentImageIndex(newIdx);
    scrollToIndex(newIdx);
  };

  /* ---------- swipe-to-dismiss (DOM-only, no React state) ---------- */
  const onTouchStart = (e: React.TouchEvent) => {
    // Don't start drag if content is scrolled
    if (scrollRef.current && scrollRef.current.scrollTop > 5) return;
    drag.current = {
      active: true,
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      currentY: e.touches[0].clientY,
      direction: 'none',
    };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!drag.current.active) return;
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    const diffX = Math.abs(x - drag.current.startX);
    const diffY = y - drag.current.startY;

    // Determine direction on first significant move
    if (drag.current.direction === 'none' && (diffX > 8 || Math.abs(diffY) > 8)) {
      drag.current.direction = diffX > Math.abs(diffY) ? 'horizontal' : 'vertical';
      if (drag.current.direction === 'vertical') {
        // Start dragging visually only for vertical
        const el = modalRef.current;
        if (el) {
          el.classList.add('product-modal--dragging');
          el.classList.remove('product-modal--snapping');
        }
      }
    }

    // Horizontal → let carousel handle it natively, don't drag modal
    if (drag.current.direction === 'horizontal') return;

    // Vertical → swipe-to-dismiss
    if (drag.current.direction === 'vertical') {
      drag.current.currentY = y;
      if (diffY > 0 && modalRef.current) {
        modalRef.current.style.transform = `translateY(${diffY}px)`;
      }
    }
  };

  const onTouchEnd = () => {
    if (!drag.current.active) return;
    const direction = drag.current.direction;
    const diff = drag.current.currentY - drag.current.startY;
    drag.current.active = false;
    drag.current.direction = 'none';

    // Horizontal swipe — nothing to clean up, carousel handled it
    if (direction === 'horizontal' || direction === 'none') return;

    const el = modalRef.current;
    if (!el) return;

    el.classList.remove('product-modal--dragging');

    if (diff > SWIPE_THRESHOLD) {
      // Dismiss
      setClosing(true);
      el.style.transform = '';
    } else {
      // Snap back
      el.classList.add('product-modal--snapping');
      el.style.transform = 'translateY(0)';
      const cleanup = () => {
        el.classList.remove('product-modal--snapping');
        el.removeEventListener('transitionend', cleanup);
      };
      el.addEventListener('transitionend', cleanup);
    }
  };

  /* ---------- overlay class ---------- */
  const overlayClass = `product-modal-overlay${closing ? ' product-modal-overlay--closing' : ''}`;

  return (
    <div
      ref={overlayRef}
      className={overlayClass}
      onClick={handleOverlayClick}
      onAnimationEnd={handleAnimationEnd}
    >
      <div
        ref={modalRef}
        className="product-modal"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle */}
        <div className="product-modal__handle" />

        {/* Scrollable area */}
        <div className="product-modal__scroll" ref={scrollRef}>
          {/* Gallery */}
          <div className="product-modal__gallery">
            <div className="product-modal__image-wrap">
              {/* Carousel — all images side-by-side, scroll-snap */}
              <div
                ref={carouselRef}
                className="product-modal__carousel"
                onScroll={handleCarouselScroll}
              >
                {images.length > 0 ? images.map((img, i) => (
                  <div
                    key={i}
                    className="product-modal__carousel-slide"
                    onClick={() => setImageViewerOpen(true)}
                  >
                    <ProductImage
                      src={img}
                      alt={`${product.name} ${i + 1}`}
                      className="product-modal__image"
                      placeholderClassName="product-modal__image-placeholder"
                    />
                  </div>
                )) : (
                  <div className="product-modal__carousel-slide">
                    <ProductImage
                      src={null}
                      alt={product.name}
                      className="product-modal__image"
                      placeholderClassName="product-modal__image-placeholder"
                    />
                  </div>
                )}
              </div>

              {/* Close — small text button overlaid on image */}
              <button
                type="button"
                className="product-modal__close"
                onClick={(e) => { e.stopPropagation(); setClosing(true); }}
              >
                Закрыть
              </button>

              {/* Heart */}
              {api.isAuthenticated() && (
                <div className="product-modal__favorite" onClick={(e) => e.stopPropagation()}>
                  <HeartIcon isFavorite={isFavorite} onClick={onToggleFavorite} size={30} />
                </div>
              )}

              {/* Arrows */}
              {images.length > 1 && (
                <>
                  <button type="button" className="product-modal__nav product-modal__nav--prev" onClick={goPrev} aria-label="Назад">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button type="button" className="product-modal__nav product-modal__nav--next" onClick={goNext} aria-label="Вперёд">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </>
              )}

              {/* Dots */}
              {images.length > 1 && (
                <div className="product-modal__dots">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`product-modal__dot${i === currentImageIndex ? ' product-modal__dot--active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(i); scrollToIndex(i); }}
                      aria-label={`Фото ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Thumbnails strip */}
            {images.length > 1 && (
              <div className="product-modal__thumbs">
                {images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`product-modal__thumb${i === currentImageIndex ? ' product-modal__thumb--active' : ''}`}
                    onClick={() => { setCurrentImageIndex(i); scrollToIndex(i); }}
                  >
                    <ProductImage
                      src={img}
                      alt={`${product.name} ${i + 1}`}
                      className="product-modal__thumb-img"
                      placeholderClassName="product-modal__thumb-placeholder"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="product-modal__info">
            <div className="product-modal__header">
              <h2 className="product-modal__name">{product.name}</h2>
              <span className="product-modal__price">{product.price.toLocaleString('ru-RU')} ₽</span>
            </div>

            {product.description && (
              <p className="product-modal__desc">{product.description}</p>
            )}

            {product.composition && product.composition.length > 0 && (
              <ProductComposition items={product.composition} />
            )}

            {/* Info detail rows: loyalty + delivery */}
            {(pointsEarned > 0 || redeemablePoints > 0 || deliveryCostLabel) && (
              <div className="product-modal__details">
                {pointsEarned > 0 && (
                  <div className="product-modal__detail-row">
                    <span className="product-modal__detail-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    </span>
                    <span className="product-modal__detail-text">
                      Баллы за покупку: <strong>+{pointsEarned}</strong>
                    </span>
                  </div>
                )}
                {redeemablePoints > 0 && (
                  <div className="product-modal__detail-row">
                    <span className="product-modal__detail-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                    </span>
                    <span className="product-modal__detail-text">
                      Можно списать: до <strong>{redeemablePoints}</strong> баллов (−{formatTotal(redeemableRub)} ₽)
                    </span>
                  </div>
                )}
                {deliveryCostLabel && (
                  <div className="product-modal__detail-row">
                    <span className="product-modal__detail-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                    </span>
                    <span className="product-modal__detail-text">
                      Доставка: {deliveryCostLabel}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Preorder date picker */}
            {showDatePicker && isPreorder && availableDates.length > 0 && (
              <div className="product-modal__dates">
                <h3 className="product-modal__dates-title">Выберите дату доставки</h3>
                <div className="product-modal__dates-list">
                  {availableDates.map((date) => (
                    <button
                      key={date}
                      type="button"
                      className="product-modal__date-btn"
                      onClick={() => onSelectPreorderDate?.(date)}
                      disabled={isAdding}
                    >
                      {new Date(date).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'long',
                        weekday: 'short',
                      })}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="product-modal__cancel-btn"
                  onClick={onCancelDatePicker}
                  disabled={isAdding}
                >
                  Отмена
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Fixed bottom bar — quantity selector + cart button */}
        {!showDatePicker && (
          <div className="product-modal__bottom-bar">
            <div className="product-modal__qty-selector">
              <button
                type="button"
                className="product-modal__qty-btn"
                onClick={handleDecrement}
                disabled={quantity <= 1}
                aria-label="Уменьшить"
              >
                −
              </button>
              <span className="product-modal__qty-value">{quantity}</span>
              <button
                type="button"
                className="product-modal__qty-btn"
                onClick={handleIncrement}
                disabled={!isPreorder && product.quantity != null && quantity >= product.quantity}
                aria-label="Увеличить"
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="product-modal__cart-btn"
              onClick={() => onAddToCart(quantity)}
              disabled={(!inStock && !isPreorder) || isAdding}
            >
              {isAdding
                ? '...'
                : isPreorder
                  ? 'Заказать на дату'
                  : inStock
                    ? `В корзину · ${formatTotal(totalPrice)} ₽`
                    : 'Нет в наличии'}
            </button>
          </div>
        )}
      </div>

      {/* Full-screen image viewer */}
      <ImageViewer
        images={images}
        initialIndex={currentImageIndex}
        isOpen={imageViewerOpen}
        onClose={() => setImageViewerOpen(false)}
      />
    </div>
  );
}
