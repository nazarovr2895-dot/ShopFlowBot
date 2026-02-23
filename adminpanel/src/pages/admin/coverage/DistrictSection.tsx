import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { useToast, useConfirm } from '../../../components/ui';
import {
  createCoverageDistrict,
  updateCoverageDistrict,
  deleteCoverageDistrict,
  type CoverageDistrict,
} from '../../../api/adminClient';

interface DistrictSectionProps {
  cityId: number;
  districts: CoverageDistrict[];
  onReload: () => Promise<void>;
}

export function DistrictSection({ cityId, districts, onReload }: DistrictSectionProps) {
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
          <input
            className="form-input"
            value={addName}
            onChange={e => setAddName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Название района"
            autoFocus
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
                <input
                  className="form-input"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleUpdate(d.id)}
                  autoFocus
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
