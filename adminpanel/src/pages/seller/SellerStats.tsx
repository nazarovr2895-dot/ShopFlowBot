import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getStats,
  SellerStats as SellerStatsType,
  SellerStatsDeliveryBreakdown,
} from '../../api/sellerClient';
import { SalesChart } from '../../components/SalesChart';
import '../Stats.css';

type RangePreset = '1d' | '7d' | '30d' | 'custom';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидают',
  accepted: 'В работе',
  assembling: 'Собираются',
  in_transit: 'В пути',
  done: 'Выполнены',
  completed: 'Завершены',
  rejected: 'Отклонены',
};

const FULL_DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const CURRENCY_FORMATTER = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const CURRENCY_PRECISE_FORMATTER = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const EMPTY_BREAKDOWN: SellerStatsDeliveryBreakdown = {
  delivery: { orders: 0, revenue: 0 },
  pickup: { orders: 0, revenue: 0 },
  other: { orders: 0, revenue: 0 },
  unknown: { orders: 0, revenue: 0 },
};

const PRESET_LABELS: Record<Exclude<RangePreset, 'custom'>, string> = {
  '1d': '1 день',
  '7d': '7 дней',
  '30d': 'Месяц',
};

function formatCurrency(value: number, precise = false): string {
  const formatter = precise ? CURRENCY_PRECISE_FORMATTER : CURRENCY_FORMATTER;
  return `${formatter.format(value)} ₽`;
}

function parseISODate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatDateRange(from?: string | null, to?: string | null): string | null {
  if (!from && !to) return null;
  if (from && to && from === to) {
    return FULL_DATE_FORMATTER.format(parseISODate(from));
  }
  if (from && to) {
    return `${FULL_DATE_FORMATTER.format(parseISODate(from))} — ${FULL_DATE_FORMATTER.format(parseISODate(to))}`;
  }
  if (from) return `с ${FULL_DATE_FORMATTER.format(parseISODate(from))}`;
  return `до ${FULL_DATE_FORMATTER.format(parseISODate(to as string))}`;
}

export function SellerStats() {
  const [stats, setStats] = useState<SellerStatsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangePreset, setRangePreset] = useState<RangePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const loadStats = useCallback(async (params?: { period?: Exclude<RangePreset, 'custom'>; date_from?: string; date_to?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getStats(params);
      setStats(data);
      if (data.filters?.date_from) {
        setCustomFrom(data.filters.date_from);
      }
      if (data.filters?.date_to) {
        setCustomTo(data.filters.date_to);
      }
    } catch {
      setStats(null);
      setError('Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rangePreset === 'custom') {
      return;
    }
    loadStats({ period: rangePreset });
  }, [rangePreset, loadStats]);

  const handlePresetChange = (preset: RangePreset) => {
    setRangePreset(preset);
    if (preset === 'custom') {
      return;
    }
  };

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      setRangePreset('custom');
      loadStats({ date_from: customFrom, date_to: customTo });
    }
  };

  const breakdown = useMemo(
    () => stats?.delivery_breakdown ?? EMPTY_BREAKDOWN,
    [stats],
  );

  const dailyData = stats?.daily_sales ?? [];
  const appliedRangeLabel = stats?.filters ? formatDateRange(stats.filters.date_from, stats.filters.date_to) : null;

  const statusRows = Object.entries(stats?.orders_by_status || {}).map(([status, count]) => (
    <tr key={status}>
      <td>{STATUS_LABELS[status] || status}</td>
      <td>{count}</td>
    </tr>
  ));

  if (loading && !stats) {
    return (
      <div className="stats-loading">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="stats-page">
      <h1 className="page-title">Статистика продаж</h1>

      <div className="card seller-stats-card">
        <div className="seller-stats-header">
          <div>
            <h2>Общая статистика</h2>
            {appliedRangeLabel && <p className="seller-stats-subtitle">{appliedRangeLabel}</p>}
          </div>
          <div className="seller-stats-controls">
            <div className="range-buttons">
              {(['1d', '7d', '30d'] as RangePreset[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`btn btn-sm ${rangePreset === preset ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handlePresetChange(preset)}
                >
                  {PRESET_LABELS[preset as Exclude<RangePreset, 'custom'>]}
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
                <input
                  type="date"
                  className="form-input form-input-sm"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  max={customTo || undefined}
                />
                <span className="range-sep">—</span>
                <input
                  type="date"
                  className="form-input form-input-sm"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  min={customFrom || undefined}
                />
                <button type="button" className="btn btn-primary btn-sm" onClick={handleCustomApply}>
                  Применить
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="seller-stats-main">
          <div className="seller-stats-chart card">
            {loading ? <div className="seller-chart-loading" /> : <SalesChart data={dailyData} />}
          </div>
          <div className="seller-stats-summary">
            <div className="summary-item">
              <span className="summary-label">Выполнено заказов</span>
              <span className="summary-value">{stats?.total_completed_orders ?? 0}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Общая выручка</span>
              <span className="summary-value">{formatCurrency(stats?.total_revenue ?? 0, true)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Комиссия платформы (18%)</span>
              <span className="summary-value">{formatCurrency(stats?.commission_18 ?? 0, true)}</span>
            </div>
            <div className="summary-item accent">
              <span className="summary-label">К получению</span>
              <span className="summary-value accent">{formatCurrency(stats?.net_revenue ?? 0, true)}</span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="card">
          <p className="empty-text">{error}</p>
        </div>
      )}

      <div className="card seller-breakdown-card">
        <h3>Выручка по способу получения</h3>
        <div className="seller-breakdown-grid">
          <div className="seller-breakdown-item">
            <span className="summary-label">Доставка</span>
            <span className="summary-value">{formatCurrency(breakdown.delivery.revenue, true)}</span>
            <span className="seller-breakdown-sub">{breakdown.delivery.orders} заказов</span>
          </div>
          <div className="seller-breakdown-item">
            <span className="summary-label">Самовывоз</span>
            <span className="summary-value">{formatCurrency(breakdown.pickup.revenue, true)}</span>
            <span className="seller-breakdown-sub">{breakdown.pickup.orders} заказов</span>
          </div>
          {(breakdown.other.revenue > 0 || breakdown.other.orders > 0) && (
            <div className="seller-breakdown-item">
              <span className="summary-label">Другие</span>
              <span className="summary-value">{formatCurrency(breakdown.other.revenue, true)}</span>
              <span className="seller-breakdown-sub">{breakdown.other.orders} заказов</span>
            </div>
          )}
          {(breakdown.unknown.revenue > 0 || breakdown.unknown.orders > 0) && (
            <div className="seller-breakdown-item">
              <span className="summary-label">Не указано</span>
              <span className="summary-value">{formatCurrency(breakdown.unknown.revenue, true)}</span>
              <span className="seller-breakdown-sub">{breakdown.unknown.orders} заказов</span>
            </div>
          )}
        </div>
      </div>

      {statusRows.length > 0 && (
        <div className="card">
          <h3>Заказы по статусам</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Статус</th>
                  <th>Количество</th>
                </tr>
              </thead>
              <tbody>{statusRows}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
