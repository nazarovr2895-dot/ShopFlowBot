import { useEffect } from 'react';
import type { SellerFilters } from '../types';
import { Filters } from './Filters';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { isTelegram } from '../utils/environment';
import './FilterModal.css';

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: SellerFilters;
  onApply: (filters: SellerFilters) => void;
}

export function FilterModal({ isOpen, onClose, filters, onApply }: FilterModalProps) {
  const { hapticFeedback } = useTelegramWebApp();
  const isTelegramEnv = isTelegram();

  // Block body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hapticFeedback('light');
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, hapticFeedback]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      hapticFeedback('light');
      onClose();
    }
  };

  return (
    <div
      className={`filter-modal ${isTelegramEnv ? 'filter-modal--telegram' : ''}`}
      data-telegram={isTelegramEnv}
      onClick={handleBackdropClick}
    >
      <div className="filter-modal__content">
        <div className="filter-modal__header">
          <h2 className="filter-modal__title">Фильтры</h2>
          <button
            className="filter-modal__close"
            onClick={onClose}
            aria-label="Закрыть фильтры"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="filter-modal__body">
          <Filters filters={filters} onApply={onApply} onClose={onClose} />
        </div>
      </div>
    </div>
  );
}
