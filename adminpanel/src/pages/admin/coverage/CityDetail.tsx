import { useState, useEffect, useCallback } from 'react';
import { X, Download, Pencil, Check, XCircle } from 'lucide-react';
import { useToast } from '../../../components/ui';
import {
  getCoverageDistricts,
  getCoverageMetroByCity,
  updateCoverageCity,
  importMetroFromDadata,
  type CoverageCity,
  type CoverageDistrict,
  type CoverageMetro,
  type MetroImportResult,
} from '../../../api/adminClient';
import { DistrictSection } from './DistrictSection';
import { MetroSection } from './MetroSection';

interface CityDetailProps {
  city: CoverageCity;
  onReload: () => Promise<void>;
  onClose: () => void;
}

export function CityDetail({ city, onReload, onClose }: CityDetailProps) {
  const toast = useToast();
  const [districts, setDistricts] = useState<CoverageDistrict[]>([]);
  const [metro, setMetro] = useState<CoverageMetro[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<MetroImportResult | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(city.name);

  const loadData = useCallback(async () => {
    try {
      const [d, m] = await Promise.all([
        getCoverageDistricts(city.id),
        getCoverageMetroByCity(city.id),
      ]);
      setDistricts(d);
      setMetro(m);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка загрузки данных города');
    } finally {
      setLoading(false);
    }
  }, [city.id, toast]);

  useEffect(() => {
    setLoading(true);
    setImportResult(null);
    setEditingName(false);
    setDraftName(city.name);
    loadData();
  }, [city.id, loadData, city.name]);

  const handleSaveName = async () => {
    if (!draftName.trim()) return;
    try {
      await updateCoverageCity(city.id, { name: draftName.trim() });
      toast.success('Название обновлено');
      setEditingName(false);
      await onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const handleImportMetro = async () => {
    if (!city.kladr_id) {
      toast.error('У города нет КЛАДР-кода. Невозможно загрузить метро из DaData.');
      return;
    }

    setImporting(true);
    setImportResult(null);
    try {
      const result = await importMetroFromDadata(city.id);
      setImportResult(result);
      if (result.imported > 0) {
        toast.success(`Импортировано ${result.imported} станций`);
      } else if (result.message) {
        toast.info(result.message);
      } else {
        toast.info('Новых станций не найдено');
      }
      await loadData();
      await onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка импорта');
    } finally {
      setImporting(false);
    }
  };

  const unmappedStations = metro.filter(s => s.district_id === null);
  const mappedStations = metro.filter(s => s.district_id !== null);

  return (
    <div className="cov-detail">
      <div className="cov-detail__header">
        <div>
          {editingName ? (
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
              <input
                className="form-input"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                autoFocus
                style={{ fontSize: 'var(--text-xl)', fontWeight: 700, width: 200 }}
              />
              <button className="btn btn-ghost btn-sm" onClick={handleSaveName}><Check size={16} /></button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditingName(false); setDraftName(city.name); }}>
                <XCircle size={16} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <h2 className="cov-detail__city-name">{city.name}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingName(true)}>
                <Pencil size={14} />
              </button>
            </div>
          )}
          {city.kladr_id && (
            <div className="cov-detail__kladr">КЛАДР: {city.kladr_id}</div>
          )}
        </div>
        <div className="cov-detail__actions">
          {city.kladr_id && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleImportMetro}
              disabled={importing}
            >
              <Download size={14} />
              {importing ? 'Загрузка...' : 'Метро из DaData'}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>

      {importResult && (
        <div className="cov-import-status">
          <div className="cov-import-stats">
            <div className="cov-import-stat">
              <div className="cov-import-stat__value cov-import-stat__value--imported">
                {importResult.imported}
              </div>
              <div className="cov-import-stat__label">Импортировано</div>
            </div>
            <div className="cov-import-stat">
              <div className="cov-import-stat__value cov-import-stat__value--skipped">
                {importResult.skipped}
              </div>
              <div className="cov-import-stat__label">Пропущено</div>
            </div>
            <div className="cov-import-stat">
              <div className="cov-import-stat__value cov-import-stat__value--unmapped">
                {importResult.unmapped}
              </div>
              <div className="cov-import-stat__label">Без района</div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', padding: 'var(--space-6)', textAlign: 'center' }}>
          Загрузка...
        </div>
      ) : (
        <>
          <DistrictSection
            cityId={city.id}
            cityKladrId={city.kladr_id}
            districts={districts}
            onReload={async () => { await loadData(); await onReload(); }}
          />

          <MetroSection
            cityId={city.id}
            districts={districts}
            mappedStations={mappedStations}
            unmappedStations={unmappedStations}
            onReload={async () => { await loadData(); await onReload(); }}
          />
        </>
      )}
    </div>
  );
}
