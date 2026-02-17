import { useCallback, useEffect, useState } from 'react';
import { getWriteOffStats, WriteOffStats } from '../../api/sellerClient';
import '../Stats.css';

type RangePreset = '7d' | '30d' | '90d' | 'custom';

const REASON_LABELS: Record<string, string> = {
  wilted: 'Увяли',
  broken: 'Сломаны',
  defect: 'Брак',
  other: 'Другое',
};

const CURRENCY_FORMATTER = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatCurrency(value: number): string {
  return `${CURRENCY_FORMATTER.format(value)} \u20BD`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function SellerWasteReport() {
  const [data, setData] = useState<WriteOffStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [rangePreset, setRangePreset] = useState<RangePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    try {
      const d = await getWriteOffStats(from, to);
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rangePreset === 'custom') return;
    const to = todayISO();
    const daysMap: Record<string, number> = { '7d': 6, '30d': 29, '90d': 89 };
    const from = daysAgoISO(daysMap[rangePreset] ?? 29);
    setCustomFrom(from);
    setCustomTo(to);
    load(from, to);
  }, [rangePreset, load]);

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      setRangePreset('custom');
      load(customFrom, customTo);
    }
  };

  const reasonEntries = data ? Object.entries(data.by_reason) : [];
  const totalLoss = data?.total_loss ?? 0;

  return (
    <div className="stats-page">
      <h1 className="page-title">Отчёт о потерях</h1>

      <div className="card seller-stats-card">
        <div className="seller-stats-header">
          <div><h2>Списания за период</h2></div>
          <div className="seller-stats-controls">
            <div className="range-buttons">
              {(['7d', '30d', '90d'] as RangePreset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`btn btn-sm ${rangePreset === p ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setRangePreset(p)}
                >
                  {p === '7d' ? '7 дней' : p === '30d' ? 'Месяц' : '3 месяца'}
                </button>
              ))}
              <button
                type="button"
                className={`btn btn-sm ${rangePreset === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRangePreset('custom')}
              >
                Свой период
              </button>
            </div>
            {rangePreset === 'custom' && (
              <div className="range-custom">
                <input type="date" className="form-input form-input-sm" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} max={customTo || undefined} />
                <span className="range-sep">&mdash;</span>
                <input type="date" className="form-input form-input-sm" value={customTo} onChange={(e) => setCustomTo(e.target.value)} min={customFrom || undefined} />
                <button type="button" className="btn btn-primary btn-sm" onClick={handleCustomApply}>Применить</button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="seller-chart-loading" />
        ) : data ? (
          <div className="seller-stats-summary">
            <div className="summary-item">
              <span className="summary-label">Всего списаний</span>
              <span className="summary-value">{data.total_count}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Списано (шт)</span>
              <span className="summary-value">{data.total_quantity}</span>
            </div>
            <div className="summary-item accent">
              <span className="summary-label">Сумма потерь</span>
              <span className="summary-value accent">{formatCurrency(data.total_loss)}</span>
            </div>
          </div>
        ) : (
          <p className="empty-text">Нет данных</p>
        )}
      </div>

      {reasonEntries.length > 0 && (
        <div className="card seller-breakdown-card">
          <h3>По причинам</h3>
          <div className="seller-breakdown-grid">
            {reasonEntries.map(([reason, vals]) => (
              <div key={reason} className="seller-breakdown-item">
                <span className="summary-label">{REASON_LABELS[reason] || reason}</span>
                <span className="summary-value">{formatCurrency(vals.loss_amount)}</span>
                <span className="seller-breakdown-sub">{vals.quantity} шт. ({totalLoss > 0 ? Math.round((vals.loss_amount / totalLoss) * 100) : 0}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && data.by_flower.length > 0 && (
        <div className="card seller-stats-top">
          <h3>По цветам</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Цветок</th>
                  <th>Списано (шт)</th>
                  <th>Сумма потерь</th>
                </tr>
              </thead>
              <tbody>
                {data.by_flower.map((f) => (
                  <tr key={f.flower_name}>
                    <td>{f.flower_name}</td>
                    <td>{f.quantity}</td>
                    <td>{formatCurrency(f.loss_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.daily.length > 0 && (
        <div className="card seller-stats-top">
          <h3>По дням</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Списано (шт)</th>
                  <th>Сумма потерь</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.filter((d) => d.quantity > 0 || d.loss_amount > 0).map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.quantity}</td>
                    <td>{formatCurrency(d.loss_amount)}</td>
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
