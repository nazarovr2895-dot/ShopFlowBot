import { useEffect, useState } from 'react';
import './ImageViewer.css';

interface ImageViewerProps {
  images: string[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export function ImageViewer({ images, initialIndex, isOpen, onClose }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [lastTouchDistance, setLastTouchDistance] = useState(0);
  const [isPinching, setIsPinching] = useState(false);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    if (!isOpen) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      return;
    }

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && scale === 1) {
      onClose();
    }
  };

  const nextImage = () => {
    if (scale === 1) {
      setCurrentIndex((prev) => (prev + 1) % images.length);
      setPosition({ x: 0, y: 0 });
    }
  };

  const prevImage = () => {
    if (scale === 1) {
      setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
      setPosition({ x: 0, y: 0 });
    }
  };

  // Calculate distance between two touches
  const getTouchDistance = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Touch events for pinch zoom and drag
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch zoom
      setIsPinching(true);
      setLastTouchDistance(getTouchDistance(e.touches));
      e.preventDefault();
    } else if (e.touches.length === 1 && scale > 1) {
      // Single finger drag when zoomed
      setIsDragging(true);
      setStartPos({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && isPinching) {
      // Pinch zoom
      e.preventDefault();
      const currentDistance = getTouchDistance(e.touches);
      const scaleDelta = currentDistance / lastTouchDistance;
      const newScale = Math.min(Math.max(1, scale * scaleDelta), 4);

      if (newScale === 1) {
        setPosition({ x: 0, y: 0 });
      }

      setScale(newScale);
      setLastTouchDistance(currentDistance);
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      // Drag when zoomed
      e.preventDefault();
      setPosition({
        x: e.touches[0].clientX - startPos.x,
        y: e.touches[0].clientY - startPos.y,
      });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setIsPinching(false);
  };

  // Mouse events for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setStartPos({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - startPos.x,
        y: e.clientY - startPos.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Wheel zoom for desktop
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(1, scale * delta), 4);

    if (newScale === 1) {
      setPosition({ x: 0, y: 0 });
    }

    setScale(newScale);
  };

  return (
    <div className="image-viewer" onClick={handleBackdropClick}>
      {/* Close button */}
      <button
        type="button"
        className="image-viewer__close"
        onClick={onClose}
        aria-label="Закрыть"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Counter */}
      <div className="image-viewer__counter">
        {currentIndex + 1} / {images.length}
      </div>

      {/* Main image */}
      <div
        className="image-viewer__image-container"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
        }}
      >
        <img
          src={images[currentIndex]}
          alt={`Фото ${currentIndex + 1}`}
          className="image-viewer__image"
          style={{
            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
            transition: isDragging || isPinching ? 'none' : 'transform 0.2s ease',
          }}
          draggable={false}
        />
      </div>

      {/* Navigation arrows */}
      {images.length > 1 && scale === 1 && (
        <>
          <button
            type="button"
            className="image-viewer__nav image-viewer__nav--prev"
            onClick={prevImage}
            aria-label="Предыдущее фото"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            className="image-viewer__nav image-viewer__nav--next"
            onClick={nextImage}
            aria-label="Следующее фото"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </>
      )}

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="image-viewer__thumbnails">
          {images.map((img, index) => (
            <button
              key={index}
              type="button"
              className={`image-viewer__thumbnail ${index === currentIndex ? 'image-viewer__thumbnail--active' : ''}`}
              onClick={() => {
                setCurrentIndex(index);
                setScale(1);
                setPosition({ x: 0, y: 0 });
              }}
            >
              <img src={img} alt={`Миниатюра ${index + 1}`} />
            </button>
          ))}
        </div>
      )}

      {/* Zoom hint */}
      {scale === 1 && (
        <div className="image-viewer__hint">
          Используйте два пальца для увеличения
        </div>
      )}
    </div>
  );
}
