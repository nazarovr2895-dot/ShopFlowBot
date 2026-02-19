import { useEffect, useState, useRef, useCallback } from 'react';
import type { Product } from '../types';
import { ProductImage } from './ProductImage';
import { HeartIcon } from './HeartIcon';
import { ImageViewer } from './ImageViewer';
import { api } from '../api/client';
import './ProductModal.css';

interface ProductModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: (e: React.MouseEvent) => void;
  onAddToCart: () => void;
  isAdding: boolean;
  inStock: boolean;
  isPreorder: boolean;
  availableDates?: string[];
  onSelectPreorderDate?: (date: string) => void;
  showDatePicker?: boolean;
  onCancelDatePicker?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Swipe-to-dismiss helpers (ref-based, zero re-renders)             */
/* ------------------------------------------------------------------ */
interface DragState {
  active: boolean;
  startY: number;
  currentY: number;
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
}: ProductModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState>({ active: false, startY: 0, currentY: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);

  const images =
    product.photo_ids && product.photo_ids.length > 0
      ? product.photo_ids
      : product.photo_id
        ? [product.photo_id]
        : [];

  /* ---------- close helpers ---------- */
  const beginClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  // When closing animation ends on the overlay → actually unmount
  const handleOverlayAnimationEnd = useCallback(() => {
    if (closing) {
      setClosing(false);
      onClose();
    }
  }, [closing, onClose]);

  /* ---------- scroll lock + ESC ---------- */
  useEffect(() => {
    if (!isOpen) return;

    // Reset state for fresh open
    setCurrentImageIndex(0);
    setClosing(false);

    const html = document.documentElement;
    html.classList.add('scroll-locked');

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') beginClose();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      html.classList.remove('scroll-locked');
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, beginClose]);

  if (!isOpen) return null;

  /* ---------- backdrop click ---------- */
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) beginClose();
  };

  /* ---------- image nav ---------- */
  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((i) => (i - 1 + images.length) % images.length);
  };
  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((i) => (i + 1) % images.length);
  };

  /* ---------- swipe-to-dismiss (DOM-only, no React state) ---------- */
  const onTouchStart = (e: React.TouchEvent) => {
    // Don't start drag if content is scrolled
    if (scrollRef.current && scrollRef.current.scrollTop > 5) return;
    drag.current = { active: true, startY: e.touches[0].clientY, currentY: e.touches[0].clientY };
    const el = modalRef.current;
    if (el) {
      el.classList.add('product-modal--dragging');
      el.classList.remove('product-modal--snapping');
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!drag.current.active) return;
    const y = e.touches[0].clientY;
    drag.current.currentY = y;
    const diff = y - drag.current.startY;
    if (diff > 0 && modalRef.current) {
      modalRef.current.style.transform = `translateY(${diff}px)`;
    }
  };

  const onTouchEnd = () => {
    if (!drag.current.active) return;
    const diff = drag.current.currentY - drag.current.startY;
    drag.current.active = false;

    const el = modalRef.current;
    if (!el) return;

    el.classList.remove('product-modal--dragging');

    if (diff > SWIPE_THRESHOLD) {
      // Dismiss
      beginClose();
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
      onAnimationEnd={handleOverlayAnimationEnd}
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
            <div
              className="product-modal__image-wrap"
              onClick={() => images.length > 0 && setImageViewerOpen(true)}
              style={{ cursor: images.length > 0 ? 'pointer' : undefined }}
            >
              <ProductImage
                src={images[currentImageIndex] || null}
                alt={product.name}
                className="product-modal__image"
                placeholderClassName="product-modal__image-placeholder"
              />

              {/* Close */}
              <button
                type="button"
                className="product-modal__close"
                onClick={(e) => { e.stopPropagation(); beginClose(); }}
                aria-label="Закрыть"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
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
                      onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(i); }}
                      aria-label={`Фото ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
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

            {/* Preorder date picker */}
            {showDatePicker && isPreorder && availableDates.length > 0 ? (
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
            ) : (
              <button
                type="button"
                className="product-modal__cart-btn"
                onClick={onAddToCart}
                disabled={(!inStock && !isPreorder) || isAdding}
              >
                {isAdding
                  ? '...'
                  : isPreorder
                    ? 'Заказать на дату'
                    : inStock
                      ? 'В корзину'
                      : 'Нет в наличии'}
              </button>
            )}
          </div>
        </div>
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
