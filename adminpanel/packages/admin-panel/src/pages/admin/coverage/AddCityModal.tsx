import { useState, useCallback, useRef, useEffect } from 'react';
import { Modal, FormField, useToast } from '@shared/components/ui';
import {
  suggestCityDadata,
  createCoverageCity,
  type DaDataCitySuggestion,
  type CoverageCity,
} from '../../../api/adminClient';

interface AddCityModalProps {
  onClose: () => void;
  onCreated: (city: CoverageCity) => void;
}

export function AddCityModal({ onClose, onCreated }: AddCityModalProps) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<DaDataCitySuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState<DaDataCitySuggestion | null>(null);
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const results = await suggestCityDadata(q);
      setSuggestions(results);
      setShowDropdown(results.length > 0);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSelected(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchSuggestions(value), 300);
  };

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleSelect = (s: DaDataCitySuggestion) => {
    setSelected(s);
    setQuery(s.name);
    setShowDropdown(false);
  };

  const handleSave = async () => {
    const name = selected?.name || query.trim();
    if (!name) {
      toast.error('Введите название города');
      return;
    }

    setSaving(true);
    try {
      const city = await createCoverageCity({
        name,
        kladr_id: selected?.kladr_id,
      });
      toast.success(`Город "${city.name}" добавлен`);
      onCreated(city);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка создания');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Добавить город"
      size="sm"
      footer={
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Сохранение...' : 'Добавить'}
          </button>
        </div>
      }
    >
      <FormField label="Название города" required>
        <div className="cov-city-search">
          <input
            type="text"
            className="form-input"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            placeholder="Начните вводить название..."
            autoFocus
          />
          {showDropdown && (
            <div className="cov-city-search__dropdown">
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className="cov-city-search__option"
                  onMouseDown={() => handleSelect(s)}
                >
                  <span className="cov-city-search__option-name">{s.name}</span>
                  {s.region && (
                    <span className="cov-city-search__option-region">{s.region}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </FormField>

      {selected && (
        <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
          КЛАДР: {selected.kladr_id}
          {selected.region && <> | {selected.region}</>}
        </div>
      )}
    </Modal>
  );
}
