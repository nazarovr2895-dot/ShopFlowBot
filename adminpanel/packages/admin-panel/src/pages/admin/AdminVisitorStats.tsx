import { useEffect, useState, useCallback } from 'react';
import { getVisitorAnalytics, type VisitorAnalytics } from '../../api/adminClient';
import { VisitorChart } from '@shared/components/VisitorChart';
import '../Stats.css';

type RangePreset = '1d' | '7d' | '30d' | 'custom';

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getRangeDates(preset: RangePreset, customFrom?: string, customTo?: string) {
  const now = new Date();
  const today = toYYYYMMDD(now);
  if (preset === '1d') return { date_from: today, date_to: today };
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
  return { date_from: customFrom || today, date_to: customTo || today };
}

export function AdminVisitorStats() {
  const [data, setData] = useState<VisitorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [rangePreset, setRangePreset] = useState<RangePreset>('7d');
  const [customFrom, setCustomFrom] = useState(() => getRangeDates('7d').date_from);
  const [customTo, setCustomTo] = useState(() => getRangeDates('7d').date_to);

  const loadData = useCallback(async (params: { date_from: string; date_to: string }) => {
    setLoading(true);
    try {
      const result = await getVisitorAnalytics(params);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rangePreset === 'custom') return;
    loadData(getRangeDates(rangePreset));
  }, [rangePreset, loadData]);

  const handlePreset = (preset: RangePreset) => {
    setRangePreset(preset);
    if (preset !== 'custom') {
      const range = getRangeDates(preset);
      setCustomFrom(range.date_from);
      setCustomTo(range.date_to);
    } else {
      loadData({ date_from: customFrom, date_to: customTo });
    }
  };

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      setRangePreset('custom');
      loadData({ date_from: customFrom, date_to: customTo });
    }
  };

  if (loading && !data) {
    return (
      <div className="stats-loading">
        <div className="loader" />
      </div>
    );
  }

  const s = data?.summary;

  return (
    <div className="stats-page">
      <div className="stats-summary card">
        <h3>Посещаемость платформы</h3>

        {/* Period selector */}
        <div className="stats-range-row">
          <span className="range-label">Период:</span>
          <div className="range-buttons">
            {(['1d', '7d', '30d', 'custom'] as RangePreset[]).map((p) => (
              <button
                key={p}
                type="button"
                className={`btn btn-sm ${rangePreset === p ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handlePreset(p)}
              >
                {p === '1d' ? '1 день' : p === '7d' ? '7 дней' : p === '30d' ? 'Месяц' : 'Свой период'}
              </button>
            ))}
          </div>
          {rangePreset === 'custom' && (
            <div className="range-custom">
              <input type="date" className="form-input form-input-sm" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <span className="range-sep">—</span>
              <input type="date" className="form-input form-input-sm" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              <button type="button" className="btn btn-primary btn-sm" onClick={handleCustomApply}>Применить</button>
            </div>
          )}
        </div>

        {/* Summary cards */}
        {s && (
          <div className="summary-grid">
            <div className="summary-item">
              <span className="summary-label">Уникальных посетителей</span>
              <span className="summary-value">{s.unique_visitors.toLocaleString('ru')}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Просмотров магазинов</span>
              <span className="summary-value">{s.shop_views.toLocaleString('ru')}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Просмотров товаров</span>
              <span className="summary-value">{s.product_views.toLocaleString('ru')}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Заказов</span>
              <span className="summary-value">{s.orders_placed.toLocaleString('ru')}</span>
            </div>
            <div className="summary-item accent">
              <span className="summary-label">Конверсия</span>
              <span className="summary-value">{s.conversion_rate}%</span>
            </div>
          </div>
        )}

        {/* Daily chart (simple SVG bar chart) */}
        {data && data.daily.length > 1 && (
          <div className="stats-chart-block">
            <div className="seller-stats-chart card">
              <VisitorChart daily={data.daily} />
            </div>
          </div>
        )}
      </div>

      {/* Top shops */}
      {data && data.top_shops.length > 0 && (
        <div className="stats-summary card stats-limits-card">
          <h3>Топ магазинов по просмотрам</h3>
          <div className="stats-table-section">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Магазин</th>
                  <th className="text-right">Просмотров</th>
                  <th className="text-right">Уникальных</th>
                </tr>
              </thead>
              <tbody>
                {data.top_shops.map((shop) => (
                  <tr key={shop.seller_id}>
                    <td>{shop.shop_name}</td>
                    <td className="text-right">{shop.views.toLocaleString('ru')}</td>
                    <td className="text-right">{shop.unique_visitors.toLocaleString('ru')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top products */}
      {data && data.top_products.length > 0 && (
        <div className="stats-summary card stats-limits-card">
          <h3>Топ товаров по просмотрам</h3>
          <div className="stats-table-section">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th>Магазин</th>
                  <th className="text-right">Просмотров</th>
                </tr>
              </thead>
              <tbody>
                {data.top_products.map((p) => (
                  <tr key={p.product_id}>
                    <td>{p.product_name}</td>
                    <td>{p.seller_name}</td>
                    <td className="text-right">{p.views.toLocaleString('ru')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
