import { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { useToast, useConfirm } from '../../../components/ui';
import {
  deleteCoverageMetro,
  updateCoverageMetro,
  type CoverageDistrict,
  type CoverageMetro,
} from '../../../api/adminClient';

interface MetroSectionProps {
  districts: CoverageDistrict[];
  mappedStations: CoverageMetro[];
  unmappedStations: CoverageMetro[];
  onReload: () => Promise<void>;
}

export function MetroSection({ districts, mappedStations, unmappedStations, onReload }: MetroSectionProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [assigningId, setAssigningId] = useState<number | null>(null);

  const totalCount = mappedStations.length + unmappedStations.length;

  // Group mapped stations by district
  const byDistrict = new Map<number, CoverageMetro[]>();
  for (const s of mappedStations) {
    if (s.district_id == null) continue;
    const arr = byDistrict.get(s.district_id) || [];
    arr.push(s);
    byDistrict.set(s.district_id, arr);
  }

  // Group by line for display within each district
  const groupByLine = (stations: CoverageMetro[]) => {
    const lines = new Map<string, CoverageMetro[]>();
    for (const s of stations) {
      const key = s.line_name || 'Без линии';
      const arr = lines.get(key) || [];
      arr.push(s);
      lines.set(key, arr);
    }
    return lines;
  };

  const handleDelete = async (station: CoverageMetro) => {
    const ok = await confirm({
      title: `Удалить "${station.name}"?`,
      message: 'Станция будет удалена из базы.',
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteCoverageMetro(station.id);
      toast.success('Станция удалена');
      await onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const handleAssignDistrict = async (stationId: number, districtId: number) => {
    try {
      await updateCoverageMetro(stationId, { district_id: districtId });
      toast.success('Район назначен');
      setAssigningId(null);
      await onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const renderStation = (s: CoverageMetro) => (
    <div key={s.id} className="cov-metro-row">
      <span
        className="cov-metro-row__dot"
        style={{ background: s.line_color || 'var(--text-tertiary)' }}
      />
      <span className="cov-metro-row__name">{s.name}</span>
      {s.line_name && <span className="cov-metro-row__line">{s.line_name}</span>}
      <div className="cov-metro-row__actions">
        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(s)}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="cov-section">
      <div className="cov-section__header">
        <div>
          <span className="cov-section__title">Станции метро</span>
          <span className="cov-section__count">({totalCount})</span>
        </div>
      </div>

      {/* Unmapped stations */}
      {unmappedStations.length > 0 && (
        <div className="cov-metro-group" style={{ background: 'rgba(245, 158, 11, 0.05)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
          <div className="cov-metro-group__label" style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <AlertTriangle size={14} />
            Без района ({unmappedStations.length})
          </div>
          {unmappedStations.map(s => (
            <div key={s.id} className="cov-metro-row">
              <span
                className="cov-metro-row__dot"
                style={{ background: s.line_color || 'var(--text-tertiary)' }}
              />
              <span className="cov-metro-row__name">{s.name}</span>
              {s.line_name && <span className="cov-metro-row__line">{s.line_name}</span>}

              {assigningId === s.id ? (
                <select
                  className="cov-assign-select"
                  autoFocus
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (val) handleAssignDistrict(s.id, val);
                  }}
                  onBlur={() => setAssigningId(null)}
                  defaultValue=""
                >
                  <option value="" disabled>Выберите район...</option>
                  {districts.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              ) : (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)' }}
                  onClick={() => setAssigningId(s.id)}
                >
                  Назначить район
                </button>
              )}

              <div className="cov-metro-row__actions">
                <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(s)}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mapped stations grouped by district */}
      {districts.map(d => {
        const stations = byDistrict.get(d.id);
        if (!stations || stations.length === 0) return null;

        const lines = groupByLine(stations);

        return (
          <div key={d.id} className="cov-metro-group">
            <div className="cov-metro-group__label">
              {d.name} ({stations.length})
            </div>
            {Array.from(lines.entries()).map(([lineName, lineStations]) => (
              <div key={lineName}>
                {lines.size > 1 && (
                  <div style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-tertiary)',
                    paddingLeft: 'var(--space-4)',
                    marginTop: 'var(--space-1)',
                    marginBottom: 'var(--space-1)',
                  }}>
                    {lineName}
                  </div>
                )}
                {lineStations.map(renderStation)}
              </div>
            ))}
          </div>
        );
      })}

      {totalCount === 0 && (
        <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--space-4) 0' }}>
          Нет станций метро. Используйте кнопку "Метро из DaData" для импорта.
        </p>
      )}
    </div>
  );
}
