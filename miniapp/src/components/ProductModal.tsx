import { useEffect, useState } from 'react';
import type { Product } from '../types';
import { ProductImage } from './ProductImage';
import { HeartIcon } from './HeartIcon';
import { ImageViewer } from './ImageViewer';
import { hasTelegramAuth } from '../api/client';
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
  const images = product.photo_ids && product.photo_ids.length > 0
    ? product.photo_ids
    : product.photo_id
    ? [product.photo_id]
    : [];

  // Закрытие по ESC
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEsc);
    // Блокируем скролл body
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <div className="product-modal-backdrop" onClick={handleBackdropClick}>
      <div className="product-modal">
        {/* Кнопка закрытия */}
        <button
          type="button"
          className="product-modal__close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="product-modal__content">
          {/* Левая часть - галерея */}
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

              {/* Лайк */}
              {hasTelegramAuth() && (
                <div className="product-modal__favorite">
                  <HeartIcon
                    isFavorite={isFavorite}
                    onClick={onToggleFavorite}
                    size={32}
                  />
                </div>
              )}

              {/* Навигация по фото */}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    className="product-modal__nav product-modal__nav--prev"
                    onClick={prevImage}
                    aria-label="Предыдущее фото"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="product-modal__nav product-modal__nav--next"
                    onClick={nextImage}
                    aria-label="Следующее фото"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </>
              )}
            </div>

            {/* Точки индикатора */}
            {images.length > 1 && (
              <div className="product-modal__dots">
                {images.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`product-modal__dot ${index === currentImageIndex ? 'product-modal__dot--active' : ''}`}
                    onClick={() => setCurrentImageIndex(index)}
                    aria-label={`Фото ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Правая часть - информация */}
          <div className="product-modal__info">
            <h2 className="product-modal__name">{product.name}</h2>
            <div className="product-modal__price">{product.price.toLocaleString('ru-RU')} ₽</div>

            {product.description && (
              <div className="product-modal__description">
                <h3 className="product-modal__section-title">Описание</h3>
                <p className="product-modal__description-text">{product.description}</p>
              </div>
            )}

            {/* Выбор даты для предзаказа */}
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
