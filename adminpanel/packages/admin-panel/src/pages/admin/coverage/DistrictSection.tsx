import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { useToast, useConfirm } from '@shared/components/ui';
import {
  createCoverageDistrict,
  updateCoverageDistrict,
  deleteCoverageDistrict,
  suggestDistrictDadata,
  type CoverageDistrict,
} from '../../../api/adminClient';

interface DistrictAutocompleteProps {
  value: string;
  onChange: (v: string) => void;
  onSelect: (name: string) => void;
  cityKladrId: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

function DistrictAutocomplete({
  value, onChange, onSelect, cityKladrId,
  placeholder = 'Название района', autoFocus, onKeyDown,
}: DistrictAutocompleteProps) {
  const [options, setOptions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchOptions = useCallback(async (q: string) => {
    if (!cityKladrId || q.length < 1) {
      setOptions([]);
      setOpen(false);
      return;
    }
    try {
      const data = await suggestDistrictDadata(q, cityKladrId);
      setOptions(data);
      setOpen(data.length > 0);
    } catch {
      setOptions([]);
    }
  }, [cityKladrId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchOptions(v), 250);
  };

  const handlePick = (name: string) => {
    onChange(name);
    setOpen(false);
    setOptions([]);
    onSelect(name);
  };

  return (
    <div className="cov-district-ac" ref={wrapperRef}>
      <input
        className="form-input"
        value={value}
        onChange={handleChange}
        onFocus={() => { if (options.length > 0) setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
      />
      {open && options.length > 0 && (
        <div className="cov-district-ac__dropdown">
          {options.map((name) => (
            <div
              key={name}
              className="cov-district-ac__option"
              onClick={() => handlePick(name)}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface DistrictSectionProps {
  cityId: number;
  cityKladrId: string | null;
  districts: CoverageDistrict[];
  onReload: () => Promise<void>;
}

export function DistrictSection({ cityId, cityKladrId, districts, onReload }: DistrictSectionProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const handleAdd = async () => {
    if (!addName.trim()) return;
    try {
      await createCoverageDistrict(cityId, { name: addName.trim() });
      toast.success('Район добавлен');
      setAddName('');
      setShowAdd(false);
      await onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const handleUpdate = async (districtId: number) => {
    if (!editName.trim()) return;
    try {
      await updateCoverageDistrict(districtId, { name: editName.trim() });
      toast.success('Район обновлён');
      setEditId(null);
      await onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const handleDelete = async (d: CoverageDistrict) => {
    const ok = await confirm({
      title: `Удалить район "${d.name}"?`,
      message: d.metro_count > 0
        ? `У района ${d.metro_count} станций метро. Сначала переместите их.`
        : 'Действие необратимо.',
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteCoverageDistrict(d.id);
      toast.success('Район удалён');
      await onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка удаления');
    }
  };

  return (
    <div className="cov-section">
      <div className="cov-section__header">
        <div>
          <span className="cov-section__title">Районы</span>
          <span className="cov-section__count">({districts.length})</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus size={14} /> Добавить
        </button>
      </div>

      {showAdd && (
        <div className="cov-inline-form">
          <DistrictAutocomplete
            value={addName}
            onChange={setAddName}
            onSelect={(name) => { setAddName(name); }}
            cityKladrId={cityKladrId}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button className="btn btn-primary btn-sm" onClick={handleAdd}>
            <Check size={14} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setShowAdd(false); setAddName(''); }}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="cov-districts">
        {districts.map(d => (
          <div key={d.id} className="cov-district-row">
            {editId === d.id ? (
              <div className="cov-inline-form" style={{ flex: 1 }}>
                <DistrictAutocomplete
                  value={editName}
                  onChange={setEditName}
                  onSelect={(name) => { setEditName(name); }}
                  cityKladrId={cityKladrId}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleUpdate(d.id)}
                />
                <button className="btn btn-primary btn-sm" onClick={() => handleUpdate(d.id)}>
                  <Check size={14} />
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <span className="cov-district-row__name">{d.name}</span>
                <div className="cov-district-row__stats">
                  <span>{d.metro_count} метро</span>
                  <span>{d.sellers_count} прод.</span>
                </div>
                <div className="cov-district-row__actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setEditId(d.id); setEditName(d.name); }}
                  >
                    <Pencil size={12} />
                  </button>
                  {d.sellers_count === 0 && d.metro_count === 0 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDelete(d)}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}

        {districts.length === 0 && (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--space-4) 0' }}>
            Нет районов. Добавьте районы перед импортом метро.
          </p>
        )}
      </div>
    </div>
  );
}
