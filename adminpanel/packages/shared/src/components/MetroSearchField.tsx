import { useEffect, useState } from 'react';
import type { MetroStation } from '../types/common';

interface MetroSearchFieldProps {
  metroId: number | null;
  metroWalkMinutes: number | null;
  onMetroChange: (metroId: number | null, walkMinutes: number | null) => void;
  /** Initial station name to display (e.g. when editing existing seller) */
  initialStationName?: string;
  /** Function to search metro stations by query */
  searchMetro: (query: string) => Promise<MetroStation[]>;
}

export function MetroSearchField({
  metroId,
  metroWalkMinutes,
  onMetroChange,
  initialStationName,
  searchMetro,
}: MetroSearchFieldProps) {
  const [query, setQuery] = useState(initialStationName || '');
  const [results, setResults] = useState<MetroStation[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    searchMetro(query.trim()).then((list) => {
      if (!cancelled) {
        setResults(list || []);
        setDropdownOpen(true);
      }
    }).finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [query, searchMetro]);

  const handleSelect = (station: MetroStation) => {
    onMetroChange(station.id, metroWalkMinutes);
    setQuery(station.name);
    setDropdownOpen(false);
  };

  const handleClear = () => {
    onMetroChange(null, null);
    setQuery('');
    setResults([]);
    setDropdownOpen(false);
  };

  return (
    <div>
      <div className="form-group">
        <label className="form-label">Станция метро</label>
        <div className="edit-metro-wrap">
          <input
            type="text"
            className="form-input"
            placeholder="Поиск станции (минимум 2 символа)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setDropdownOpen(true)}
          />
          {dropdownOpen && (
            <div className="edit-metro-dropdown">
              {query.trim().length < 2 ? (
                <div className="edit-metro-hint">Введите минимум 2 символа</div>
              ) : searching ? (
                <div className="edit-metro-hint">Поиск...</div>
              ) : results.length === 0 ? (
                <div className="edit-metro-hint">Станции не найдены</div>
              ) : (
                results.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    className="edit-metro-option"
                    onClick={() => handleSelect(m)}
                  >
                    {m.line_color && (
                      <span
                        className="edit-metro-line"
                        style={{ backgroundColor: m.line_color || '#999' }}
                      />
                    )}
                    {m.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        {metroId && (
          <small className="form-hint">
            Выбрано: ID {metroId}{' '}
            <button type="button" style={{ border: 'none', background: 'none', color: '#dc3545', cursor: 'pointer', textDecoration: 'underline', padding: 0 }} onClick={handleClear}>
              Очистить
            </button>
          </small>
        )}
      </div>

      {metroId && (
        <div className="form-group">
          <label className="form-label">Время до метро (мин)</label>
          <input
            type="number"
            className="form-input"
            value={metroWalkMinutes ?? ''}
            onChange={(e) => {
              const val = e.target.value ? parseInt(e.target.value, 10) : null;
              onMetroChange(metroId, val);
            }}
            min="1"
            placeholder="Минуты пешком"
          />
        </div>
      )}
    </div>
  );
}
