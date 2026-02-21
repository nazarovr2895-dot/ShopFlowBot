import { useEffect, useState, useCallback } from 'react';
import { getFinanceSummary, getGlobalCommission, updateGlobalCommission, type AdminFinanceParams } from '../../api/adminClient';
import type { AdminFinanceResponse } from '../../types';
import { PageHeader } from '../../components/ui';
import { SalesChart } from '../../components/SalesChart';
import { TrendingUp, TrendingDown, DollarSign, Settings, AlertTriangle } from 'lucide-react';
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

  // Commission settings state
  const [globalCommission, setGlobalCommission] = useState<number>(3);
  const [showCommissionEdit, setShowCommissionEdit] = useState(false);
  const [newCommission, setNewCommission] = useState('');
  const [confirmStep, setConfirmStep] = useState(0); // 0=hidden, 1-4=steps
  const [confirmInput, setConfirmInput] = useState('');
  const [commissionSaving, setCommissionSaving] = useState(false);
  const [commissionError, setCommissionError] = useState('');

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
      if (result.global_commission_rate != null) {
        setGlobalCommission(result.global_commission_rate);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [preset, groupBy, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  // Load global commission on mount
  useEffect(() => {
    getGlobalCommission().then(r => setGlobalCommission(r.commission_percent)).catch(() => {});
  }, []);

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

  // Commission edit flow
  const startCommissionEdit = () => {
    setShowCommissionEdit(true);
    setNewCommission('');
    setConfirmStep(0);
    setConfirmInput('');
    setCommissionError('');
  };

  const cancelCommissionEdit = () => {
    setShowCommissionEdit(false);
    setConfirmStep(0);
    setNewCommission('');
    setConfirmInput('');
    setCommissionError('');
  };

  const handleCommissionSubmit = () => {
    const val = parseInt(newCommission, 10);
    if (isNaN(val) || val < 0 || val > 100) {
      setCommissionError('Введите число от 0 до 100');
      return;
    }
    if (val === globalCommission) {
      setCommissionError('Значение совпадает с текущей комиссией');
      return;
    }
    setCommissionError('');
    setConfirmStep(1);
  };

  const handleConfirmStep = async () => {
    if (confirmStep < 3) {
      setConfirmStep(confirmStep + 1);
    } else if (confirmStep === 3) {
      // Step 4: verify re-typed value
      if (confirmInput !== newCommission) {
        setCommissionError('Введённое значение не совпадает');
        return;
      }
      setCommissionSaving(true);
      setCommissionError('');
      try {
        const val = parseInt(newCommission, 10);
        await updateGlobalCommission(val);
        setGlobalCommission(val);
        cancelCommissionEdit();
        load(); // Reload finance data
      } catch (e) {
        setCommissionError(e instanceof Error ? e.message : 'Ошибка при сохранении');
      } finally {
        setCommissionSaving(false);
      }
    }
  };

  const revChange = data ? pctChange(data.period.revenue, data.previous_period.revenue) : 0;
  const ordChange = data ? pctChange(data.period.orders, data.previous_period.orders) : 0;

  const chartData = data?.series.map((s) => ({
    date: s.period,
    revenue: s.revenue,
    orders: s.orders,
  })) || [];

  const confirmMessages = [
    `Вы уверены, что хотите изменить глобальную комиссию с ${globalCommission}% на ${newCommission}%?`,
    'Это изменение коснётся ВСЕХ продавцов, у которых не задана индивидуальная комиссия.',
    'Изменение применится ко всем расчётам. Подтвердите изменение.',
  ];

  return (
    <div className="admin-finance">
      <PageHeader title="Финансы" subtitle="Доходность платформы" />

      {/* ── Commission Settings Card ── */}
      <div className="af-commission-card">
        <div className="af-commission-header">
          <Settings size={16} />
          <span className="af-commission-title">Глобальная комиссия платформы</span>
          <span className="af-commission-value">{globalCommission}%</span>
          {!showCommissionEdit && (
            <button className="af-commission-edit-btn" onClick={startCommissionEdit}>
              Изменить
            </button>
          )}
        </div>

        {showCommissionEdit && confirmStep === 0 && (
          <div className="af-commission-form">
            <div className="af-commission-input-row">
              <input
                type="number"
                className="af-commission-input"
                min={0}
                max={100}
                placeholder={`Текущая: ${globalCommission}%`}
                value={newCommission}
                onChange={(e) => setNewCommission(e.target.value)}
              />
              <span className="af-commission-unit">%</span>
              <button className="af-commission-save-btn" onClick={handleCommissionSubmit}>
                Далее
              </button>
              <button className="af-commission-cancel-btn" onClick={cancelCommissionEdit}>
                Отмена
              </button>
            </div>
            {commissionError && <div className="af-commission-error">{commissionError}</div>}
          </div>
        )}

        {showCommissionEdit && confirmStep >= 1 && confirmStep <= 3 && (
          <div className="af-commission-confirm">
            <div className="af-commission-confirm-icon">
              <AlertTriangle size={20} />
            </div>
            <div className="af-commission-confirm-step">
              Шаг {confirmStep} из 4
            </div>
            <div className="af-commission-confirm-msg">
              {confirmStep <= 3 && confirmMessages[confirmStep - 1]}
            </div>
            {confirmStep === 3 && (
              <div className="af-commission-confirm-retype">
                <label>Введите новое значение ещё раз для подтверждения:</label>
                <input
                  type="number"
                  className="af-commission-input"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder={`Введите ${newCommission}`}
                />
              </div>
            )}
            {commissionError && <div className="af-commission-error">{commissionError}</div>}
            <div className="af-commission-confirm-actions">
              <button
                className="af-commission-confirm-btn"
                onClick={handleConfirmStep}
                disabled={commissionSaving}
              >
                {commissionSaving ? 'Сохранение...' : confirmStep < 3 ? 'Подтверждаю' : 'Сохранить'}
              </button>
              <button className="af-commission-cancel-btn" onClick={cancelCommissionEdit}>
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>

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
                <span className="af-kpi-label">Доход платформы ({globalCommission}%)</span>
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
                      <th>Комиссия</th>
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
                        <td className="af-cell-num af-cell-commission">
                          {fmtCurrency(s.commission)}
                          <span className="af-cell-commission-rate"> ({s.commission_rate ?? globalCommission}%)</span>
                        </td>
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
