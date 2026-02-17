import { Search, X } from 'lucide-react';
import './SearchInput.css';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Поиск...', className = '' }: SearchInputProps) {
  return (
    <div className={`search-input-wrap ${className}`}>
      <Search size={16} className="search-input-icon" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="search-input"
      />
      {value && (
        <button className="search-input-clear" onClick={() => onChange('')} aria-label="Clear">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
