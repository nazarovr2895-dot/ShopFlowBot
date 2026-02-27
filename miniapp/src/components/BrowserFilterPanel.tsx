import type { SellerFilters } from '../types';
import { Filters } from './Filters';
import './BrowserFilterPanel.css';

interface BrowserFilterPanelProps {
  isOpen: boolean;
  filters: SellerFilters;
  onApply: (filters: SellerFilters) => void;
}

export function BrowserFilterPanel({ isOpen, filters, onApply }: BrowserFilterPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="browser-filter-panel">
      <Filters filters={filters} onApply={onApply} layout="browser" />
    </div>
  );
}
