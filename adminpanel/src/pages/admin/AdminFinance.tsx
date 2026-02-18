import { useEffect, useState, useCallback } from 'react';
import { getFinanceSummary, type AdminFinanceParams } from '../../api/adminClient';
import type { AdminFinanceResponse } from '../../types';
import { PageHeader } from '../../components/ui';
import { SalesChart } from '../../components/SalesChart';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import './AdminFinance.css';

function fmtCurrency(n: number): string {
  return `${n.toLocaleString('ru-RU')} ₽`;
}

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pctChange(current: number, previous: number): number {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

type RangePreset = '7d' | '30d' | '90d' | 'custom';
type GroupBy = 'day' | 'week' | 'month';

export function AdminFinance() {
  const [data, setData] = useState<AdminFinanceResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [preset, setPreset] = useState<RangePreset>('30d');
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 29);
    return toYYYYMMDD(d);
  });
  const [dateTo, setDateTo] = useState(() => toYYYYMMDD(new Date()));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let from = dateFrom;
      let to = dateTo;
      if (preset !== 'custom') {
        const now = new Date();
        to = toYYYYMMDD(now);
        const d = new Date();
        if (preset === '7d') d.setDate(d.getDate() - 6);
        else if (preset === '30d') d.setDate(d.getDate() - 29);
        else d.setDate(d.getDate() - 89);
        from = toYYYYMMDD(d);
      }
      const params: AdminFinanceParams = { date_from: from, date_to: to, group_by: groupBy };
      const result = await getFinanceSummary(params);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [preset, groupBy, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const handlePreset = (p: RangePreset) => {
    setPreset(p);
    if (p !== 'custom') {
      const now = new Date();
      setDateTo(toYYYYMMDD(now));
      const d = new Date();
      if (p === '7d') d.setDate(d.getDate() - 6);
      else if (p === '30d') d.setDate(d.getDate() - 29);
      else d.setDate(d.getDate() - 89);
      setDateFrom(toYYYYMMDD(d));
    }
  };

  const revChange = data ? pctChange(data.period.revenue, data.previous_period.revenue) : 0;
  const ordChange = data ? pctChange(data.period.orders, data.previous_period.orders) : 0;

  const chartData = data?.series.map((s) => ({
    date: s.period,
    revenue: s.revenue,
    orders: s.orders,
  })) || [];

  return (
    <div className="admin-finance">
      <PageHeader title="Финансы" subtitle="Доходность платформы" />

      {/* ── Period Controls ── */}
      <div className="af-controls">
        <div className="af-presets">
          {(['7d', '30d', '90d', 'custom'] as RangePreset[]).map((p) => (
            <button
              key={p}
              className={`af-preset-btn ${preset === p ? 'af-preset-btn--active' : ''}`}
              onClick={() => handlePreset(p)}
            >
              {p === '7d' ? '7 дней' : p === '30d' ? '30 дней' : p === '90d' ? '90 дней' : 'Период'}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="af-custom-range">
            <input type="date" className="af-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <span className="af-sep">—</span>
            <input type="date" className="af-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <button className="af-apply-btn" onClick={load}>Применить</button>
          </div>
        )}
        <div className="af-group-by">
          <span className="af-group-label">Группировка:</span>
          {(['day', 'week', 'month'] as GroupBy[]).map((g) => (
            <button
              key={g}
              className={`af-group-btn ${groupBy === g ? 'af-group-btn--active' : ''}`}
              onClick={() => setGroupBy(g)}
            >
              {g === 'day' ? 'День' : g === 'week' ? 'Неделя' : 'Месяц'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="af-loading"><div className="loader" /></div>
      ) : !data ? (
        <div className="af-empty">Не удалось загрузить данные</div>
      ) : (
        <>
          {/* ── KPI Cards ── */}
          <div className="af-kpi-grid">
            <div className="af-kpi">
              <div className="af-kpi-header">
                <span className="af-kpi-label">Выручка</span>
                <span className={`af-trend ${revChange >= 0 ? 'af-trend--up' : 'af-trend--down'}`}>
                  {revChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {revChange >= 0 ? '+' : ''}{revChange}%
                </span>
              </div>
              <div className="af-kpi-value">{fmtCurrency(data.period.revenue)}</div>
              <div className="af-kpi-prev">Пред. период: {fmtCurrency(data.previous_period.revenue)}</div>
            </div>

            <div className="af-kpi af-kpi--accent">
              <div className="af-kpi-header">
                <span className="af-kpi-label">Доход платформы (18%)</span>
                <DollarSign size={14} />
              </div>
              <div className="af-kpi-value">{fmtCurrency(data.period.profit)}</div>
              <div className="af-kpi-prev">Пред. период: {fmtCurrency(data.previous_period.profit)}</div>
            </div>

            <div className="af-kpi">
              <div className="af-kpi-header">
                <span className="af-kpi-label">Заказов</span>
                <span className={`af-trend ${ordChange >= 0 ? 'af-trend--up' : 'af-trend--down'}`}>
                  {ordChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {ordChange >= 0 ? '+' : ''}{ordChange}%
                </span>
              </div>
              <div className="af-kpi-value">{data.period.orders.toLocaleString('ru')}</div>
              <div className="af-kpi-prev">Пред. период: {data.previous_period.orders.toLocaleString('ru')}</div>
            </div>

            <div className="af-kpi">
              <div className="af-kpi-header">
                <span className="af-kpi-label">Средний чек</span>
              </div>
              <div className="af-kpi-value">{fmtCurrency(data.period.avg_check || 0)}</div>
            </div>
          </div>

          {/* ── Revenue Chart ── */}
          <div className="af-chart-card">
            <h3 className="af-chart-title">Динамика выручки</h3>
            <SalesChart data={chartData} />
          </div>

          {/* ── Revenue by Seller ── */}
          {data.by_seller.length > 0 && (
            <div className="af-seller-card">
              <h3 className="af-seller-title">Доходность по продавцам</h3>
              <div className="af-seller-table-wrap">
                <table className="af-seller-table">
                  <thead>
                    <tr>
                      <th>Магазин</th>
                      <th>Тариф</th>
                      <th>Заказов</th>
                      <th>Выручка</th>
                      <th>Комиссия 18%</th>
                      <th>Доля</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_seller.map((s) => (
                      <tr key={s.seller_id}>
                        <td className="af-cell-name">{s.shop_name}</td>
                        <td>
                          <span className={`af-plan-badge af-plan-badge--${s.plan}`}>
                            {s.plan === 'free' ? 'Free' : s.plan === 'pro' ? 'Pro' : 'Premium'}
                          </span>
                        </td>
                        <td className="af-cell-num">{s.orders}</td>
                        <td className="af-cell-num">{fmtCurrency(s.revenue)}</td>
                        <td className="af-cell-num af-cell-commission">{fmtCurrency(s.commission)}</td>
                        <td className="af-cell-share">
                          <div className="af-share-bar">
                            <div className="af-share-fill" style={{ width: `${Math.min(s.share_pct, 100)}%` }} />
                          </div>
                          <span>{s.share_pct}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
