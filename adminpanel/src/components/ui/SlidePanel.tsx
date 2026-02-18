import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import './SlidePanel.css';

interface SlidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function SlidePanel({ isOpen, onClose, title, children }: SlidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Focus trap (simplified)
  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    const first = panelRef.current.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    first?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="slide-panel-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        className="slide-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="slide-panel-header">
          <h2 className="slide-panel-title">{title}</h2>
          <button className="slide-panel-close" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <div className="slide-panel-body">{children}</div>
      </div>
    </div>
  );
}
