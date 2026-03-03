import { useEffect, useState, useRef, useCallback } from 'react';
import WebApp from '@twa-dev/sdk';
import type { Product } from '../types';
import { ProductImage } from './ProductImage';
import { ImageViewer } from './ImageViewer';
import { ProductComposition } from './ProductComposition';
import { api } from '../api/client';
import { Loader } from './Loader';
import { isTelegram } from '../utils/environment';
import './OrderProductInfoModal.css';

interface OrderProductInfoModalProps {
  productId: number;
  isOpen: boolean;
  onClose: () => void;
}

interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  currentY: number;
  direction: 'none' | 'horizontal' | 'vertical';
}

const SWIPE_THRESHOLD = 120;

export function OrderProductInfoModal({
  productId,
  isOpen,
  onClose,
}: OrderProductInfoModalProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState>({ active: false, startX: 0, startY: 0, currentY: 0, direction: 'none' });

  // Fetch product data when modal opens
  useEffect(() => {
    if (!isOpen || !productId) return;
    setLoading(true);
    setError(null);
    setProduct(null);
    setCurrentImageIndex(0);
    setClosing(false);

    api.getProduct(productId)
      .then((data) => setProduct(data))
      .catch(() => setError('Товар больше не доступен'))
      .finally(() => setLoading(false));
  }, [isOpen, productId]);

  // Scroll lock + ESC + Telegram swipe guard
  useEffect(() => {
    if (!isOpen) return;

    const html = document.documentElement;
    html.classList.add('scroll-locked');

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
      if (isTelegram()) {
        try { WebApp.enableVerticalSwipes(); } catch { /* ignore */ }
      }
    };
  }, [isOpen]);

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
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setCurrentImageIndex((prev) => {
      const clamped = Math.max(0, idx);
      return clamped !== prev ? clamped : prev;
    });
  }, []);

  const handleAnimationEnd = useCallback((e: React.AnimationEvent) => {
    if (e.target !== e.currentTarget) return;
    if (closing) {
      setClosing(false);
      onClose();
    }
  }, [closing, onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setClosing(true);
  };

  /* ---------- swipe-to-dismiss ---------- */
  const onTouchStart = (e: React.TouchEvent) => {
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

    if (drag.current.direction === 'none' && (diffX > 8 || Math.abs(diffY) > 8)) {
      drag.current.direction = diffX > Math.abs(diffY) ? 'horizontal' : 'vertical';
      if (drag.current.direction === 'vertical') {
        const el = modalRef.current;
        if (el) {
          el.classList.add('opi-modal--dragging');
          el.classList.remove('opi-modal--snapping');
        }
      }
    }

    if (drag.current.direction === 'horizontal') return;

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

    if (direction === 'horizontal' || direction === 'none') return;

    const el = modalRef.current;
    if (!el) return;

    el.classList.remove('opi-modal--dragging');

    if (diff > SWIPE_THRESHOLD) {
      setClosing(true);
      el.style.transform = '';
    } else {
      el.classList.add('opi-modal--snapping');
      el.style.transform = 'translateY(0)';
      const cleanup = () => {
        el.classList.remove('opi-modal--snapping');
        el.removeEventListener('transitionend', cleanup);
      };
      el.addEventListener('transitionend', cleanup);
    }
  };

  if (!isOpen) return null;

  const images =
    product?.photo_ids && product.photo_ids.length > 0
      ? product.photo_ids
      : product?.photo_id
        ? [product.photo_id]
        : [];

  const overlayClass = `opi-modal-overlay${closing ? ' opi-modal-overlay--closing' : ''}`;

  return (
    <div
      ref={overlayRef}
      className={overlayClass}
      onClick={handleOverlayClick}
      onAnimationEnd={handleAnimationEnd}
    >
      <div
        ref={modalRef}
        className="opi-modal"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="opi-modal__handle" />

        <div className="opi-modal__scroll" ref={scrollRef}>
          {loading ? (
            <div className="opi-modal__loader"><Loader centered /></div>
          ) : error ? (
            <div className="opi-modal__error">{error}</div>
          ) : product ? (
            <>
              {/* Gallery */}
              <div className="opi-modal__gallery">
                <div className="opi-modal__image-wrap">
                  <div
                    ref={carouselRef}
                    className="opi-modal__carousel"
                    onScroll={handleCarouselScroll}
                  >
                    {images.length > 0 ? images.map((img, i) => (
                      <div
                        key={i}
                        className="opi-modal__carousel-slide"
                        onClick={() => setImageViewerOpen(true)}
                      >
                        <ProductImage
                          src={img}
                          alt={`${product.name} ${i + 1}`}
                          className="opi-modal__image"
                          placeholderClassName="opi-modal__image-placeholder"
                        />
                      </div>
                    )) : (
                      <div className="opi-modal__carousel-slide">
                        <ProductImage
                          src={null}
                          alt={product.name}
                          className="opi-modal__image"
                          placeholderClassName="opi-modal__image-placeholder"
                        />
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="opi-modal__close"
                    onClick={(e) => { e.stopPropagation(); setClosing(true); }}
                  >
                    Закрыть
                  </button>

                  {images.length > 1 && (
                    <div className="opi-modal__dots">
                      {images.map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          className={`opi-modal__dot${i === currentImageIndex ? ' opi-modal__dot--active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(i); scrollToIndex(i); }}
                          aria-label={`Фото ${i + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {images.length > 1 && (
                  <div className="opi-modal__thumbs">
                    {images.map((img, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`opi-modal__thumb${i === currentImageIndex ? ' opi-modal__thumb--active' : ''}`}
                        onClick={() => { setCurrentImageIndex(i); scrollToIndex(i); }}
                      >
                        <ProductImage
                          src={img}
                          alt={`${product.name} ${i + 1}`}
                          className="opi-modal__thumb-img"
                          placeholderClassName="opi-modal__thumb-placeholder"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Product info */}
              <div className="opi-modal__info">
                <div className="opi-modal__header">
                  <h2 className="opi-modal__name">{product.name}</h2>
                  <span className="opi-modal__price">{product.price.toLocaleString('ru-RU')} &#8381;</span>
                </div>

                {product.description && (
                  <p className="opi-modal__desc">{product.description}</p>
                )}

                {product.composition && product.composition.length > 0 && (
                  <ProductComposition items={product.composition} />
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {product && (
        <ImageViewer
          images={images}
          initialIndex={currentImageIndex}
          isOpen={imageViewerOpen}
          onClose={() => setImageViewerOpen(false)}
        />
      )}
    </div>
  );
}
