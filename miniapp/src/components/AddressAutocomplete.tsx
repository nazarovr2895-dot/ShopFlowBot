import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { api } from '../api/client';
import { getYmapsApiKey } from '../api/ymapsConfig';
import './AddressAutocomplete.css';

const YandexMapProvider = lazy(() => import('./map/YandexMapProvider').then(m => ({ default: m.YandexMapProvider })));
const AddressPickerMap = lazy(() => import('./map/AddressPickerMap').then(m => ({ default: m.AddressPickerMap })));

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
  district_id?: number | null;
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
  const [showMapPicker, setShowMapPicker] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hasYmapsKey = !!getYmapsApiKey();

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
      // If district wasn't resolved from suggest, use district_id from check_delivery response
      if (!districtId) {
        const firstResult = Object.values(results).find(r => r.district_id);
        if (firstResult?.district_id) {
          districtId = firstResult.district_id;
          onDistrictIdResolved?.(districtId);
        }
      }
      onDeliveryCheck(results);
    }
  };

  const handleMapSelect = useCallback((address: string, _lat: number, _lon: number) => {
    setShowMapPicker(false);
    onChange(address);
    // Trigger delivery check with address string (backend resolves district via DaData)
    if (sellerIds && sellerIds.length > 0 && onDeliveryCheck) {
      const results: Record<number, DeliveryCheckResult> = {};
      Promise.all(
        sellerIds.map(async (sellerId) => {
          try {
            results[sellerId] = await api.checkDelivery(sellerId, { address });
          } catch {
            results[sellerId] = { delivers: false, delivery_price: 0, message: 'Ошибка проверки доставки' };
          }
        })
      ).then(() => {
        const firstResult = Object.values(results).find(r => r.district_id);
        if (firstResult?.district_id) {
          onDistrictIdResolved?.(firstResult.district_id);
        }
        onDeliveryCheck(results);
      });
    }
  }, [onChange, sellerIds, onDeliveryCheck, onDistrictIdResolved]);

  return (
    <>
      <div className={`address-autocomplete ${className}`} ref={wrapperRef}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <input
            type="text"
            className={`checkout-form__input address-autocomplete__input`}
            value={value}
            onChange={handleInputChange}
            onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
            placeholder={placeholder}
            required={required}
            autoComplete="off"
            style={{ flex: 1 }}
          />
          {hasYmapsKey && (
            <button
              type="button"
              onClick={() => setShowMapPicker(true)}
              title="Указать на карте"
              style={{
                padding: '0 12px',
                border: 'none',
                borderRadius: 10,
                background: 'var(--tg-theme-secondary-bg-color, #f0f0f0)',
                color: 'var(--tg-theme-link-color, #3390ec)',
                cursor: 'pointer',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
            </button>
          )}
        </div>
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

      {/* Map picker modal */}
      {showMapPicker && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
          background: 'var(--tg-theme-bg-color, #fff)',
        }}>
          <Suspense fallback={<div style={{ padding: 20, textAlign: 'center' }}>Загрузка карты...</div>}>
            <YandexMapProvider height="100%">
              <AddressPickerMap
                onSelect={handleMapSelect}
                onClose={() => setShowMapPicker(false)}
              />
            </YandexMapProvider>
          </Suspense>
        </div>
      )}
    </>
  );
}
