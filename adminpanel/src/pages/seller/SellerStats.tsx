import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getStats,
  getCustomerStats,
  exportStatsCSV,
  getPreorderAnalytics,
  SellerStats as SellerStatsType,
  SellerStatsDeliveryBreakdown,
  CustomerStats,
  PreorderAnalytics,
} from '../../api/sellerClient';
import { SalesChart } from '../../components/SalesChart';
import { PageHeader, TabBar, EmptyState, useToast } from '../../components/ui';
import '../Stats.css';

type RangePreset = '1d' | '7d' | '30d' | 'custom';
type StatsTab = 'sales' | 'customers' | 'preorders';

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


const TABS: { key: StatsTab; label: string }[] = [
  { key: 'sales', label: 'Продажи' },
  { key: 'customers', label: 'Клиенты' },
  { key: 'preorders', label: 'Предзаказы' },
];

const RANGE_TABS: { key: RangePreset; label: string }[] = [
  { key: '1d', label: '1 день' },
  { key: '7d', label: '7 дней' },
  { key: '30d', label: 'Месяц' },
  { key: 'custom', label: 'Свой период' },
];

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
  const toast = useToast();
  const [stats, setStats] = useState<SellerStatsType | null>(null);
  const [customerData, setCustomerData] = useState<CustomerStats | null>(null);
  const [preorderData, setPreorderData] = useState<PreorderAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [custLoading, setCustLoading] = useState(false);
  const [preorderLoading, setPreorderLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rangePreset, setRangePreset] = useState<RangePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [activeTab, setActiveTab] = useState<StatsTab>('sales');

  const loadStats = useCallback(async (params?: { period?: Exclude<RangePreset, 'custom'>; date_from?: string; date_to?: string }) => {
    setLoading(true);
    setCustLoading(true);
    setPreorderLoading(true);
    setError(null);
    try {
      const [data, custData, preorderAnalytics] = await Promise.all([
        getStats(params),
        getCustomerStats(params).catch((err) => {
          console.warn('Customer stats load failed:', err);
          return null;
        }),
        getPreorderAnalytics(params).catch((err) => {
          console.warn('Preorder analytics load failed:', err);
          return null;
        }),
      ]);
      setStats(data);
      setCustomerData(custData);
      setPreorderData(preorderAnalytics);
      if (data.filters?.date_from) {
        setCustomFrom(data.filters.date_from);
      }
      if (data.filters?.date_to) {
        setCustomTo(data.filters.date_to);
      }
    } catch {
      setStats(null);
      setCustomerData(null);
      setPreorderData(null);
      setError('Не удалось загрузить статистику');
    } finally {
      setLoading(false);
      setCustLoading(false);
      setPreorderLoading(false);
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

  const handleExportStats = async () => {
    try {
      const params = rangePreset === 'custom'
        ? { date_from: customFrom, date_to: customTo }
        : { period: rangePreset };
      const blob = await exportStatsCSV(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stats_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка экспорта');
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
      <PageHeader
        title="Статистика"
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportStats}
          >
            Экспорт CSV
          </button>
        }
      />

      <TabBar
        tabs={TABS}
        activeTab={activeTab}
        onChange={(key) => setActiveTab(key as StatsTab)}
      />

      <div className="card seller-stats-card">
        <div className="seller-stats-header">
          <div>
            <h2>Общая статистика</h2>
            {appliedRangeLabel && <p className="seller-stats-subtitle">{appliedRangeLabel}</p>}
          </div>
          <div className="seller-stats-controls">
            <TabBar
              tabs={RANGE_TABS}
              activeTab={rangePreset}
              onChange={(key) => handlePresetChange(key as RangePreset)}
              size="small"
            />
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

        {activeTab === 'sales' && (
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
                <span className="summary-label">Средний чек</span>
                <span className="summary-value">{formatCurrency(stats?.average_check ?? 0, true)}</span>
              </div>
              {stats?.previous_period_revenue != null && stats?.previous_period_revenue > 0 && (
                <div className="summary-item">
                  <span className="summary-label">К выручке за тот же период ранее</span>
                  <span className="summary-value">
                    {(() => {
                      const prev = stats.previous_period_revenue ?? 0;
                      const curr = stats.total_revenue ?? 0;
                      const pct = prev ? Math.round(((curr - prev) / prev) * 100) : 0;
                      return pct >= 0 ? `+${pct}%` : `${pct}%`;
                    })()}
                  </span>
                </div>
              )}
              <div className="summary-item">
                <span className="summary-label">Комиссия Flurai ({stats?.commission_rate ?? 3}%)</span>
                <span className="summary-value">{formatCurrency(stats?.commission_amount ?? 0, true)}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Комиссия платёжной системы (~3.5%)</span>
                <span className="summary-value summary-value--muted">Удерживается ЮKassa</span>
              </div>
              <div className="summary-item accent">
                <span className="summary-label">К получению</span>
                <span className="summary-value accent">{formatCurrency(stats?.net_revenue ?? 0, true)}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'customers' && (
          <div className="seller-stats-summary seller-stats-tab-content">
            {custLoading ? (
              <div className="seller-chart-loading" />
            ) : customerData ? (
              <>
                <div className="summary-item">
                  <span className="summary-label">Покупателей за период</span>
                  <span className="summary-value">{customerData.total_customers}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Новых клиентов</span>
                  <span className="summary-value">{customerData.new_customers}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Вернувшихся</span>
                  <span className="summary-value">{customerData.returning_customers}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Повторных заказов</span>
                  <span className="summary-value">{customerData.repeat_orders}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Retention rate</span>
                  <span className="summary-value">{customerData.retention_rate}%</span>
                </div>
                <div className="summary-item accent">
                  <span className="summary-label">Средний LTV</span>
                  <span className="summary-value accent">{formatCurrency(customerData.avg_ltv, true)}</span>
                </div>
              </>
            ) : (
              <EmptyState title="Нет данных" />
            )}
          </div>
        )}

        {activeTab === 'preorders' && (
          <div className="seller-stats-summary seller-stats-tab-content">
            {preorderLoading ? (
              <div className="seller-chart-loading" />
            ) : preorderData ? (
              <>
                <div className="summary-item">
                  <span className="summary-label">Всего предзаказов</span>
                  <span className="summary-value">{preorderData.total_preorders}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Выполнено</span>
                  <span className="summary-value">{preorderData.completed_preorders}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Отменено</span>
                  <span className="summary-value">{preorderData.cancelled_preorders}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">% выполнения</span>
                  <span className="summary-value">{preorderData.completion_rate.toFixed(1)}%</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">% отмен</span>
                  <span className="summary-value">{preorderData.cancellation_rate.toFixed(1)}%</span>
                </div>
                <div className="summary-item accent">
                  <span className="summary-label">Выручка предзаказов</span>
                  <span className="summary-value accent">{formatCurrency(preorderData.total_revenue, true)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Средний срок заказа (дней до доставки)</span>
                  <span className="summary-value">{preorderData.avg_lead_days.toFixed(1)}</span>
                </div>
              </>
            ) : (
              <EmptyState title="Нет данных по предзаказам" message="Предзаказы за выбранный период отсутствуют или произошла ошибка загрузки" />
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="card">
          <EmptyState title={error} />
        </div>
      )}

      {activeTab === 'sales' && (
        <>
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

          {(stats?.top_products?.length ?? 0) > 0 && (
            <div className="card seller-stats-top">
              <h3>Популярные товары (за период)</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Товар</th>
                      <th>Продано (шт)</th>
                      <th>В заказах</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats?.top_products?.map((p) => (
                      <tr key={p.product_id}>
                        <td>{p.product_name}</td>
                        <td>{p.quantity_sold}</td>
                        <td>{p.order_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(stats?.top_bouquets?.length ?? 0) > 0 && (
            <div className="card seller-stats-top">
              <h3>Популярные букеты (за период)</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Букет</th>
                      <th>Продано (шт)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats?.top_bouquets?.map((b) => (
                      <tr key={b.bouquet_id}>
                        <td>{b.bouquet_name}</td>
                        <td>{b.quantity_sold}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'preorders' && preorderData && (preorderData.top_products?.length ?? 0) > 0 && (
        <div className="card seller-stats-top">
          <h3>Топ товаров по предзаказам (за период)</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th>Предзаказов</th>
                </tr>
              </thead>
              <tbody>
                {preorderData.top_products.map((p, i) => (
                  <tr key={i}>
                    <td>{p.product_name}</td>
                    <td>{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'customers' && customerData && (customerData.top_customers?.length ?? 0) > 0 && (
        <div className="card seller-stats-top">
          <h3>Топ покупателей (за период)</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Покупатель</th>
                  <th>Заказов</th>
                  <th>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {customerData.top_customers.map((c) => (
                  <tr key={c.buyer_id}>
                    <td>{c.name}{c.phone ? ` (${c.phone})` : ''}</td>
                    <td>{c.orders_count}</td>
                    <td>{formatCurrency(c.total_spent, true)}</td>
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
