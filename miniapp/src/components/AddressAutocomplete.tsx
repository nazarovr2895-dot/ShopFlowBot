import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import './AddressAutocomplete.css';

interface AddressSuggestion {
  value: string;
  lat: string | null;
  lon: string | null;
  city: string | null;
  city_district: string | null;
}

interface DeliveryCheckResult {
  delivers: boolean;
  delivery_price: number;
  message: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
  onDistrictResolved?: (districtName: string | null) => void;
  /** Seller IDs to check delivery for; called when address is selected */
  sellerIds?: number[];
  /** Callback with per-seller delivery check results */
  onDeliveryCheck?: (results: Record<number, DeliveryCheckResult>) => void;
  /** Districts from backend, keyed by name -> id (used to resolve buyerDistrictId for checkout) */
  districtNameToId?: Record<string, number>;
  onDistrictIdResolved?: (districtId: number | null) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export function AddressAutocomplete({
  value,
  onChange,
  onDistrictResolved,
  sellerIds,
  onDeliveryCheck,
  districtNameToId,
  onDistrictIdResolved,
  placeholder = 'Улица, дом, квартира',
  className = '',
  required = false,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.suggestAddress(query);
      setSuggestions(data);
      setShowDropdown(data.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    // Reset district when user types
    onDistrictResolved?.(null);
    onDistrictIdResolved?.(null);
    // Reset delivery check results when user changes address
    onDeliveryCheck?.({});

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  const handleSelect = async (suggestion: AddressSuggestion) => {
    onChange(suggestion.value);
    setShowDropdown(false);
    setSuggestions([]);

    const districtName = suggestion.city_district;
    onDistrictResolved?.(districtName);

    // Resolve district ID from name (for checkout buyer_district_id)
    let districtId: number | null = null;
    if (districtName && districtNameToId) {
      districtId = districtNameToId[districtName] ?? null;
    }
    onDistrictIdResolved?.(districtId);

    // Check delivery for each seller — pass address string so backend can resolve district via DaData
    if (sellerIds && sellerIds.length > 0 && onDeliveryCheck) {
      const results: Record<number, DeliveryCheckResult> = {};
      await Promise.all(
        sellerIds.map(async (sellerId) => {
          try {
            results[sellerId] = await api.checkDelivery(sellerId, {
              districtId: districtId ?? undefined,
              districtName: districtName ?? undefined,
              address: suggestion.value,
            });
          } catch {
            results[sellerId] = { delivers: false, delivery_price: 0, message: 'Ошибка проверки доставки' };
          }
        })
      );
      onDeliveryCheck(results);
    }
  };

  return (
    <div className={`address-autocomplete ${className}`} ref={wrapperRef}>
      <input
        type="text"
        className={`checkout-form__input address-autocomplete__input`}
        value={value}
        onChange={handleInputChange}
        onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
      {showDropdown && suggestions.length > 0 && (
        <div className="address-autocomplete__dropdown">
          {suggestions.map((s, i) => (
            <div
              key={i}
              className="address-autocomplete__option"
              onClick={() => handleSelect(s)}
            >
              {s.value}
            </div>
          ))}
        </div>
      )}
      {loading && (
        <div className="address-autocomplete__status address-autocomplete__status--loading">
          Поиск адреса...
        </div>
      )}
    </div>
  );
}
