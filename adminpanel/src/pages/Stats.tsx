import { useEffect, useState, useCallback } from 'react';
import { getAllStats } from '../api/adminClient';
import type { SellerStats } from '../types';
import './Stats.css';

type RangePreset = '1d' | '7d' | '30d' | 'custom';

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getRangeDates(preset: RangePreset, customFrom?: string, customTo?: string): { date_from: string; date_to: string } {
  const now = new Date();
  const today = toYYYYMMDD(now);
  if (preset === '1d') {
    return { date_from: today, date_to: today };
  }
  if (preset === '7d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    return { date_from: toYYYYMMDD(from), date_to: today };
  }
  if (preset === '30d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 29);
    return { date_from: toYYYYMMDD(from), date_to: today };
  }
  return {
    date_from: customFrom || today,
    date_to: customTo || today,
  };
}

export function Stats() {
  const [sellerStats, setSellerStats] = useState<SellerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangePreset, setRangePreset] = useState<RangePreset>('30d');
  const [customFrom, setCustomFrom] = useState(() => getRangeDates('30d').date_from);
  const [customTo, setCustomTo] = useState(() => getRangeDates('30d').date_to);

  const loadStats = useCallback(async (params?: { date_from?: string; date_to?: string }) => {
    setLoading(true);
    try {
      const data = await getAllStats(params);
      setSellerStats(data || []);
    } catch {
      setSellerStats([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rangePreset === 'custom') return;
    const { date_from, date_to } = getRangeDates(rangePreset);
    loadStats({ date_from, date_to });
  }, [rangePreset, loadStats]);

  const totalOrders = sellerStats.reduce((s, x) => s + (x.orders_count || 0), 0);
  const totalSales = sellerStats.reduce((s, x) => s + (x.total_sales || 0), 0);
  const totalProfit = sellerStats.reduce((s, x) => s + (x.platform_profit || 0), 0);

  const handlePreset = (preset: RangePreset) => {
    setRangePreset(preset);
    if (preset !== 'custom') {
      const { date_from, date_to } = getRangeDates(preset);
      setCustomFrom(date_from);
      setCustomTo(date_to);
    } else {
      loadStats({ date_from: customFrom, date_to: customTo });
    }
  };

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      setRangePreset('custom');
      loadStats({ date_from: customFrom, date_to: customTo });
    }
  };

  if (loading && sellerStats.length === 0) {
    return (
      <div className="stats-loading">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="stats-page">
      <h1 className="page-title">Статистика</h1>

      <div className="stats-summary card">
        <h3>Общая статистика</h3>
        <div className="stats-range-row">
          <span className="range-label">Период:</span>
          <div className="range-buttons">
            <button
              type="button"
              className={`btn btn-sm ${rangePreset === '1d' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handlePreset('1d')}
            >
              1 день
            </button>
            <button
              type="button"
              className={`btn btn-sm ${rangePreset === '7d' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handlePreset('7d')}
            >
              7 дней
            </button>
            <button
              type="button"
              className={`btn btn-sm ${rangePreset === '30d' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handlePreset('30d')}
            >
              Месяц
            </button>
            <button
              type="button"
              className={`btn btn-sm ${rangePreset === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handlePreset('custom')}
            >
              Свой период
            </button>
          </div>
          {rangePreset === 'custom' && (
            <div className="range-custom">
              <input
                type="date"
                className="form-input form-input-sm"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <span className="range-sep">—</span>
              <input
                type="date"
                className="form-input form-input-sm"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={handleCustomApply}>
                Применить
              </button>
            </div>
          )}
        </div>
        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-label">Заказов</span>
            <span className="summary-value">{totalOrders}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Продажи</span>
            <span className="summary-value">{totalSales.toLocaleString('ru')} ₽</span>
          </div>
          <div className="summary-item accent">
            <span className="summary-label">Доход платформы (18%)</span>
            <span className="summary-value">{totalProfit.toLocaleString('ru')} ₽</span>
          </div>
        </div>
      </div>
    </div>
  );
}
