import { useEffect, useState, useCallback } from 'react';
import { getAllStats, getStatsOverview, getLimitsAnalytics, type StatsOverviewDailyPoint, type LimitsAnalytics } from '../api/adminClient';
import type { SellerStats } from '../types';
import { SalesChart } from '../components/SalesChart';
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
  const [dailySales, setDailySales] = useState<StatsOverviewDailyPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [limitsData, setLimitsData] = useState<LimitsAnalytics | null>(null);
  const [rangePreset, setRangePreset] = useState<RangePreset>('30d');
  const [customFrom, setCustomFrom] = useState(() => getRangeDates('30d').date_from);
  const [customTo, setCustomTo] = useState(() => getRangeDates('30d').date_to);

  const loadStats = useCallback(async (params?: { date_from?: string; date_to?: string }) => {
    setLoading(true);
    setDailySales([]);
    try {
      const [list, overview, limits] = await Promise.all([
        getAllStats(params),
        getStatsOverview(params),
        getLimitsAnalytics(),
      ]);
      setSellerStats(list || []);
      setDailySales(overview?.daily_sales ?? []);
      setLimitsData(limits || null);
    } catch {
      setSellerStats([]);
      setDailySales([]);
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

  const chartData = dailySales.map((p) => ({ date: p.date, revenue: p.revenue, orders: p.orders }));

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
        <div className="stats-chart-block">
          <div className="seller-stats-chart card">
            {loading ? <div className="seller-chart-loading" /> : <SalesChart data={chartData} />}
          </div>
        </div>
      </div>

      {/* Загрузка лимитов */}
      {limitsData && (
        <div className="stats-summary card" style={{ marginTop: '1.5rem' }}>
          <h3>Загрузка продавцов</h3>
          <div className="summary-grid">
            <div className="summary-item">
              <span className="summary-label">Всего продавцов</span>
              <span className="summary-value">{limitsData.total_sellers}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Активны сегодня</span>
              <span className="summary-value">{limitsData.active_today}</span>
            </div>
            <div className="summary-item accent">
              <span className="summary-label">Исчерпали лимит</span>
              <span className="summary-value">{limitsData.exhausted}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Закрыты на сегодня</span>
              <span className="summary-value">{limitsData.closed_today}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Без лимита</span>
              <span className="summary-value">{limitsData.no_limit}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Средняя загрузка</span>
              <span className="summary-value">{limitsData.avg_load_pct}%</span>
            </div>
          </div>

          {/* По тарифам */}
          {Object.keys(limitsData.by_plan).length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem' }}>По тарифам</h4>
              <table className="stats-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)' }}>Тариф</th>
                    <th style={{ textAlign: 'right', padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)' }}>Всего</th>
                    <th style={{ textAlign: 'right', padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)' }}>Активных</th>
                    <th style={{ textAlign: 'right', padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)' }}>Исчерпали</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(limitsData.by_plan).map(([plan, info]) => (
                    <tr key={plan}>
                      <td style={{ padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)' }}>{plan === 'free' ? 'Free' : plan === 'pro' ? 'Pro' : 'Premium'}</td>
                      <td style={{ textAlign: 'right', padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)' }}>{info.total}</td>
                      <td style={{ textAlign: 'right', padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)' }}>{info.active}</td>
                      <td style={{ textAlign: 'right', padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)' }}>{info.exhausted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Топ загруженных */}
          {limitsData.top_loaded.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem' }}>Топ-10 загруженных</h4>
              <table className="stats-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)' }}>Магазин</th>
                    <th style={{ textAlign: 'right', padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)' }}>Заказы</th>
                    <th style={{ textAlign: 'right', padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)' }}>Лимит</th>
                    <th style={{ textAlign: 'right', padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)' }}>Загрузка</th>
                    <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)' }}>Тариф</th>
                  </tr>
                </thead>
                <tbody>
                  {limitsData.top_loaded.map((s) => (
                    <tr key={s.tg_id}>
                      <td style={{ padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)' }}>{s.shop_name || s.fio}</td>
                      <td style={{ textAlign: 'right', padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)' }}>{s.used}</td>
                      <td style={{ textAlign: 'right', padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)' }}>{s.limit}</td>
                      <td style={{ textAlign: 'right', padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)', color: s.load_pct >= 100 ? '#e74c3c' : s.load_pct >= 75 ? '#e67e22' : 'inherit' }}>
                        {s.load_pct}%
                      </td>
                      <td style={{ padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)' }}>{s.plan === 'free' ? 'Free' : s.plan === 'pro' ? 'Pro' : 'Premium'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
