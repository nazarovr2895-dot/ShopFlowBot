import { useState, useMemo, useRef, useEffect } from 'react';
import { SearchInput } from '@shared/components/ui';
import { X } from 'lucide-react';
import './DistrictSelector.css';

interface DistrictOption {
  id: number;
  name: string;
  city_id: number;
}

interface DistrictSelectorProps {
  districts: DistrictOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  usedByOtherZonesMap?: Map<number, string>;
}

const MAX_VISIBLE_TAGS = 8;
const MAX_VISIBLE_TAGS_MOBILE = 5;

function groupByLetter(items: DistrictOption[]): [string, DistrictOption[]][] {
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const groups = new Map<string, DistrictOption[]>();
  for (const d of sorted) {
    const letter = d.name[0].toUpperCase();
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(d);
  }
  return Array.from(groups.entries());
}

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth <= 600);
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth <= 600);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return mobile;
}

export function DistrictSelector({ districts, selectedIds, onChange, usedByOtherZonesMap }: DistrictSelectorProps) {
  const [search, setSearch] = useState('');
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const maxTags = isMobile ? MAX_VISIBLE_TAGS_MOBILE : MAX_VISIBLE_TAGS;

  // Reset scroll on search change
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [search]);

  // Filter districts by search
  const filtered = useMemo(() => {
    if (!search.trim()) return districts;
    const q = search.trim().toLowerCase();
    return districts.filter(d => d.name.toLowerCase().includes(q));
  }, [districts, search]);

  // Group filtered districts by letter
  const groups = useMemo(() => groupByLetter(filtered), [filtered]);

  // Selected district objects (for tags)
  const selectedDistricts = useMemo(() => {
    const idSet = new Set(selectedIds);
    return districts
      .filter(d => idSet.has(d.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [districts, selectedIds]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Handlers
  const toggle = (id: number) => {
    onChange(
      selectedSet.has(id)
        ? selectedIds.filter(i => i !== id)
        : [...selectedIds, id]
    );
  };

  const remove = (id: number) => {
    onChange(selectedIds.filter(i => i !== id));
  };

  const selectAll = () => {
    const filteredIds = filtered.map(d => d.id);
    const merged = new Set([...selectedIds, ...filteredIds]);
    onChange(Array.from(merged));
  };

  const clearAll = () => {
    if (!search.trim()) {
      onChange([]);
    } else {
      const filteredIds = new Set(filtered.map(d => d.id));
      onChange(selectedIds.filter(id => !filteredIds.has(id)));
    }
  };

  const selectGroup = (groupDistricts: DistrictOption[]) => {
    const ids = groupDistricts.map(d => d.id);
    const merged = new Set([...selectedIds, ...ids]);
    onChange(Array.from(merged));
  };

  const clearGroup = (groupDistricts: DistrictOption[]) => {
    const ids = new Set(groupDistricts.map(d => d.id));
    onChange(selectedIds.filter(id => !ids.has(id)));
  };

  const isGroupAllSelected = (groupDistricts: DistrictOption[]) =>
    groupDistricts.every(d => selectedSet.has(d.id));

  // Tags display
  const visibleTags = tagsExpanded ? selectedDistricts : selectedDistricts.slice(0, maxTags);
  const hiddenCount = selectedDistricts.length - maxTags;

  return (
    <div className="ds-selector">
      {/* Summary bar */}
      <div className="ds-summary">
        <span className="ds-summary__count">
          Выбрано: <strong>{selectedIds.length}</strong> из {districts.length}
        </span>
        <div className="ds-summary__actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={selectAll}>
            {search.trim() ? 'Выбрать найденные' : 'Выбрать все'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>
            {search.trim() ? 'Снять найденные' : 'Снять все'}
          </button>
        </div>
      </div>

      {/* Selected tags */}
      {selectedDistricts.length > 0 && (
        <div className="ds-tags">
          {visibleTags.map(d => (
            <span key={d.id} className="ds-tag">
              {d.name}
              <button
                type="button"
                className="ds-tag__remove"
                onClick={() => remove(d.id)}
                aria-label={`Убрать ${d.name}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {!tagsExpanded && hiddenCount > 0 && (
            <button
              type="button"
              className="ds-tags__overflow"
              onClick={() => setTagsExpanded(true)}
            >
              +{hiddenCount} ещё
            </button>
          )}
          {tagsExpanded && hiddenCount > 0 && (
            <button
              type="button"
              className="ds-tags__overflow"
              onClick={() => setTagsExpanded(false)}
            >
              Свернуть
            </button>
          )}
        </div>
      )}

      {/* Search */}
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Поиск района..."
        className="ds-search"
      />

      {/* Grouped list */}
      <div className="ds-list" ref={listRef}>
        {groups.length === 0 && (
          <div className="ds-empty">
            {search.trim() ? 'Ничего не найдено' : 'Нет доступных районов'}
          </div>
        )}
        {groups.map(([letter, items]) => {
          const allSelected = isGroupAllSelected(items);
          const selectedInGroup = items.filter(d => selectedSet.has(d.id)).length;
          return (
            <div key={letter} className="ds-group">
              <div className="ds-group__header">
                <span className="ds-group__letter">{letter}</span>
                <div className="ds-group__right">
                  <span className="ds-group__count">
                    {selectedInGroup}/{items.length}
                  </span>
                  <button
                    type="button"
                    className="ds-group__toggle"
                    onClick={() => allSelected ? clearGroup(items) : selectGroup(items)}
                  >
                    {allSelected ? 'Снять' : 'Выбрать'}
                  </button>
                </div>
              </div>
              {items.map(d => {
                const isSelected = selectedSet.has(d.id);
                const zoneName = usedByOtherZonesMap?.get(d.id);
                return (
                  <label
                    key={d.id}
                    className={`ds-item ${isSelected ? 'ds-item--selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="ds-item__checkbox"
                      checked={isSelected}
                      onChange={() => toggle(d.id)}
                    />
                    <span className="ds-item__name">{d.name}</span>
                    {zoneName && (
                      <span className="ds-item__zone-hint">Зона: {zoneName}</span>
                    )}
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
