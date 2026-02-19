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
  const [isClosing, setIsClosing] = useState(false);
  const images = product.photo_ids && product.photo_ids.length > 0
    ? product.photo_ids
    : product.photo_id
    ? [product.photo_id]
    : [];

  // Swipe-to-dismiss state
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const modalRef = useRef<HTMLDivElement>(null);

  const animateClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 250);
  }, [onClose]);

  // Close on ESC
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') animateClose();
    };

    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, animateClose]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setCurrentImageIndex(0);
      setDragY(0);
      setIsDragging(false);
      setIsClosing(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      animateClose();
    }
  };

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  // Touch handlers for swipe-to-dismiss
  const handleTouchStart = (e: React.TouchEvent) => {
    // Only allow drag from handle area or when content is at top
    const content = modalRef.current?.querySelector('.product-modal__content') as HTMLElement | null;
    if (content && content.scrollTop > 0) return;
    dragStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const diff = e.touches[0].clientY - dragStartY.current;
    if (diff > 0) {
      setDragY(diff);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragY > 150) {
      animateClose();
    }
    setDragY(0);
  };

  const modalStyle = isDragging && dragY > 0
    ? { transform: `translateY(${dragY}px)`, transition: 'none' }
    : undefined;

  const modalClassName = [
    'product-modal',
    isDragging && 'product-modal--dragging',
    isClosing && 'product-modal--closing',
  ].filter(Boolean).join(' ');

  return (
    <div className="product-modal-backdrop" onClick={handleBackdropClick}>
      <div
        ref={modalRef}
        className={modalClassName}
        style={modalStyle}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="product-modal__handle" />

        <div className="product-modal__content">
          {/* Gallery */}
          <div className="product-modal__gallery">
            <div
              className="product-modal__image-container"
              onClick={() => images.length > 0 && setImageViewerOpen(true)}
              style={{ cursor: images.length > 0 ? 'pointer' : 'default' }}
            >
              <ProductImage
                src={images[currentImageIndex] || null}
                alt={product.name}
                className="product-modal__image"
                placeholderClassName="product-modal__image-placeholder"
              />

              {/* Close button on image */}
              <button
                type="button"
                className="product-modal__close"
                onClick={(e) => {
                  e.stopPropagation();
                  animateClose();
                }}
                aria-label="Закрыть"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>

              {/* Heart on image */}
              {api.isAuthenticated() && (
                <div
                  className="product-modal__favorite"
                  onClick={(e) => e.stopPropagation()}
                >
                  <HeartIcon
                    isFavorite={isFavorite}
                    onClick={onToggleFavorite}
                    size={32}
                  />
                </div>
              )}

              {/* Nav arrows */}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    className="product-modal__nav product-modal__nav--prev"
                    onClick={prevImage}
                    aria-label="Предыдущее фото"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="product-modal__nav product-modal__nav--next"
                    onClick={nextImage}
                    aria-label="Следующее фото"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </>
              )}

              {/* Dots on image */}
              {images.length > 1 && (
                <div className="product-modal__dots">
                  {images.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      className={`product-modal__dot ${index === currentImageIndex ? 'product-modal__dot--active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentImageIndex(index);
                      }}
                      aria-label={`Фото ${index + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="product-modal__info">
            <div className="product-modal__name-price">
              <h2 className="product-modal__name">{product.name}</h2>
              <div className="product-modal__price">{product.price.toLocaleString('ru-RU')} ₽</div>
            </div>

            {product.description && (
              <p className="product-modal__description-text">{product.description}</p>
            )}

            {/* Date picker for pre-order */}
            {showDatePicker && isPreorder && availableDates.length > 0 ? (
              <div className="product-modal__dates">
                <h3 className="product-modal__section-title">Выберите дату доставки</h3>
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
                        weekday: 'short'
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
                className="product-modal__add-btn"
                onClick={onAddToCart}
                disabled={(!inStock && !isPreorder) || isAdding}
              >
                <span>
                  {isAdding
                    ? '…'
                    : isPreorder
                    ? 'Заказать на дату'
                    : inStock
                    ? 'В корзину'
                    : 'Нет в наличии'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Image Viewer */}
      <ImageViewer
        images={images}
        initialIndex={currentImageIndex}
        isOpen={imageViewerOpen}
        onClose={() => setImageViewerOpen(false)}
      />
    </div>
  );
}
