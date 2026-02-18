import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminDashboard } from '../api/adminClient';
import type { AdminDashboardData } from '../types';
import { SalesChart } from '../components/SalesChart';
import {
  TrendingUp, TrendingDown, Clock, AlertTriangle,
  ShoppingBag, Truck, CheckCircle, XCircle, Users, Store,
} from 'lucide-react';
import './Dashboard.css';

function pctChange(current: number, previous: number): number {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  const pct = pctChange(current, previous);
  if (pct === 0) return <span className="trend-badge trend-badge--neutral">0%</span>;
  const isUp = pct > 0;
  return (
    <span className={`trend-badge ${isUp ? 'trend-badge--up' : 'trend-badge--down'}`}>
      {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {isUp ? '+' : ''}{pct}%
    </span>
  );
}

function fmt(n: number): string {
  return n.toLocaleString('ru-RU');
}

function fmtCurrency(n: number): string {
  return `${n.toLocaleString('ru-RU')} ₽`;
}

export function Dashboard() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await getAdminDashboard();
        setData(result);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loader" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="dashboard">
        <div className="dashboard-error">Не удалось загрузить данные дашборда</div>
      </div>
    );
  }

  const { today, pipeline, alerts, weekly_revenue, top_sellers_today, totals } = data;
  const totalAlerts =
    alerts.expiring_placements.length +
    alerts.exhausted_limits.length +
    alerts.stuck_orders.length;

  const chartData = weekly_revenue.map((p) => ({ date: p.date, revenue: p.revenue, orders: p.orders }));

  return (
    <div className="dashboard">
      {/* ── Header ── */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Дашборд</h1>
          <p className="dash-subtitle">Обзор платформы в реальном времени</p>
        </div>
        <div className="dash-totals">
          <div className="dash-total-item">
            <Store size={14} />
            <span>{fmt(totals.sellers)} продавцов</span>
          </div>
          <div className="dash-total-item">
            <Users size={14} />
            <span>{fmt(totals.buyers)} покупателей</span>
          </div>
          <div className="dash-total-item">
            <ShoppingBag size={14} />
            <span>{fmt(totals.orders)} заказов всего</span>
          </div>
        </div>
      </div>

      {/* ── Today's KPIs ── */}
      <div className="dash-kpi-grid">
        <div className="dash-kpi-card">
          <div className="dash-kpi-header">
            <span className="dash-kpi-label">Заказов сегодня</span>
            <TrendBadge current={today.orders} previous={today.orders_yesterday} />
          </div>
          <div className="dash-kpi-value">{fmt(today.orders)}</div>
          <div className="dash-kpi-secondary">Вчера: {fmt(today.orders_yesterday)}</div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-header">
            <span className="dash-kpi-label">Выручка сегодня</span>
            <TrendBadge current={today.revenue} previous={today.revenue_yesterday} />
          </div>
          <div className="dash-kpi-value">{fmtCurrency(today.revenue)}</div>
          <div className="dash-kpi-secondary">Вчера: {fmtCurrency(today.revenue_yesterday)}</div>
        </div>

        <div className="dash-kpi-card dash-kpi-card--accent">
          <div className="dash-kpi-header">
            <span className="dash-kpi-label">Доход платформы</span>
            <TrendBadge current={today.profit} previous={today.profit_yesterday} />
          </div>
          <div className="dash-kpi-value">{fmtCurrency(today.profit)}</div>
          <div className="dash-kpi-secondary">18% комиссия</div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-header">
            <span className="dash-kpi-label">Средний чек</span>
            <TrendBadge current={today.avg_check} previous={today.avg_check_yesterday} />
          </div>
          <div className="dash-kpi-value">{fmtCurrency(today.avg_check)}</div>
          <div className="dash-kpi-secondary">Вчера: {fmtCurrency(today.avg_check_yesterday)}</div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-header">
            <span className="dash-kpi-label">Новых покупателей</span>
            <TrendBadge current={today.new_customers} previous={today.new_customers_yesterday} />
          </div>
          <div className="dash-kpi-value">{fmt(today.new_customers)}</div>
          <div className="dash-kpi-secondary">Вчера: {fmt(today.new_customers_yesterday)}</div>
        </div>
      </div>

      {/* ── Order Pipeline ── */}
      <div className="dash-section">
        <h2 className="dash-section-title">Воронка заказов</h2>
        <div className="dash-pipeline">
          <div className="dash-pipe-item dash-pipe-item--pending">
            <Clock size={20} />
            <div className="dash-pipe-count">{pipeline.pending.count}</div>
            <div className="dash-pipe-label">Ожидают</div>
            <div className="dash-pipe-amount">{fmtCurrency(pipeline.pending.amount)}</div>
          </div>
          <div className="dash-pipe-arrow">&rarr;</div>
          <div className="dash-pipe-item dash-pipe-item--progress">
            <ShoppingBag size={20} />
            <div className="dash-pipe-count">{pipeline.in_progress.count}</div>
            <div className="dash-pipe-label">В работе</div>
            <div className="dash-pipe-amount">{fmtCurrency(pipeline.in_progress.amount)}</div>
          </div>
          <div className="dash-pipe-arrow">&rarr;</div>
          <div className="dash-pipe-item dash-pipe-item--transit">
            <Truck size={20} />
            <div className="dash-pipe-count">{pipeline.in_transit.count}</div>
            <div className="dash-pipe-label">Доставка</div>
            <div className="dash-pipe-amount">{fmtCurrency(pipeline.in_transit.amount)}</div>
          </div>
          <div className="dash-pipe-arrow">&rarr;</div>
          <div className="dash-pipe-item dash-pipe-item--done">
            <CheckCircle size={20} />
            <div className="dash-pipe-count">{pipeline.completed_today.count}</div>
            <div className="dash-pipe-label">Выполнено</div>
            <div className="dash-pipe-amount">{fmtCurrency(pipeline.completed_today.amount)}</div>
          </div>
          {pipeline.rejected_today.count > 0 && (
            <>
              <div className="dash-pipe-divider" />
              <div className="dash-pipe-item dash-pipe-item--rejected">
                <XCircle size={20} />
                <div className="dash-pipe-count">{pipeline.rejected_today.count}</div>
                <div className="dash-pipe-label">Отклонено</div>
                <div className="dash-pipe-amount">{fmtCurrency(pipeline.rejected_today.amount)}</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Alerts & Chart Row ── */}
      <div className="dash-row">
        {/* Alerts */}
        <div className="dash-col dash-col--alerts">
          <div className={`dash-card ${totalAlerts > 0 ? 'dash-card--warning' : ''}`}>
            <div className="dash-card-header">
              <AlertTriangle size={16} className={totalAlerts > 0 ? 'text-warning' : 'text-muted'} />
              <h3>Алерты {totalAlerts > 0 && <span className="dash-alert-count">{totalAlerts}</span>}</h3>
            </div>
            {totalAlerts === 0 ? (
              <div className="dash-empty-alert">Все в порядке</div>
            ) : (
              <div className="dash-alerts-list">
                {alerts.stuck_orders.map((a) => (
                  <div key={a.order_id} className="dash-alert-item dash-alert-item--danger">
                    <Clock size={14} />
                    <div>
                      <div className="dash-alert-text">
                        Заказ #{a.order_id} ждёт {a.minutes_pending} мин
                      </div>
                      <div className="dash-alert-sub">{a.seller_name} &middot; {fmtCurrency(a.amount)}</div>
                    </div>
                  </div>
                ))}
                {alerts.exhausted_limits.map((a) => (
                  <div key={a.tg_id} className="dash-alert-item dash-alert-item--warning">
                    <AlertTriangle size={14} />
                    <div>
                      <div className="dash-alert-text">{a.shop_name} — лимит исчерпан</div>
                      <div className="dash-alert-sub">{a.used}/{a.limit} заказов</div>
                    </div>
                  </div>
                ))}
                {alerts.expiring_placements.map((a) => (
                  <div key={a.tg_id} className="dash-alert-item dash-alert-item--info">
                    <Store size={14} />
                    <div>
                      <div className="dash-alert-text">{a.shop_name}</div>
                      <div className="dash-alert-sub">
                        Размещение истекает через {a.expires_in_days} {a.expires_in_days === 1 ? 'день' : a.expires_in_days < 5 ? 'дня' : 'дней'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Weekly Revenue Chart */}
        <div className="dash-col dash-col--chart">
          <div className="dash-card">
            <div className="dash-card-header">
              <TrendingUp size={16} />
              <h3>Выручка за 7 дней</h3>
            </div>
            <SalesChart data={chartData} />
          </div>
        </div>
      </div>

      {/* ── Top Sellers Today ── */}
      <div className="dash-section">
        <div className="dash-card">
          <div className="dash-card-header">
            <Store size={16} />
            <h3>Топ продавцов сегодня</h3>
            <Link to="/sellers" className="dash-link-more">Все продавцы &rarr;</Link>
          </div>
          {top_sellers_today.length === 0 ? (
            <div className="dash-empty-text">Нет завершённых заказов сегодня</div>
          ) : (
            <div className="dash-sellers-table">
              <div className="dash-sellers-row dash-sellers-row--header">
                <div className="dash-sellers-cell dash-sellers-cell--name">Магазин</div>
                <div className="dash-sellers-cell dash-sellers-cell--num">Заказов</div>
                <div className="dash-sellers-cell dash-sellers-cell--num">Выручка</div>
                <div className="dash-sellers-cell dash-sellers-cell--load">Загрузка</div>
              </div>
              {top_sellers_today.map((s) => (
                <div key={s.tg_id} className="dash-sellers-row">
                  <div className="dash-sellers-cell dash-sellers-cell--name">{s.shop_name}</div>
                  <div className="dash-sellers-cell dash-sellers-cell--num">{s.orders}</div>
                  <div className="dash-sellers-cell dash-sellers-cell--num">{fmtCurrency(s.revenue)}</div>
                  <div className="dash-sellers-cell dash-sellers-cell--load">
                    <div className="dash-load-bar">
                      <div
                        className={`dash-load-fill ${s.load_pct >= 100 ? 'dash-load-fill--danger' : s.load_pct >= 75 ? 'dash-load-fill--warning' : ''}`}
                        style={{ width: `${Math.min(s.load_pct, 100)}%` }}
                      />
                    </div>
                    <span className="dash-load-pct">{s.load_pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Navigation ── */}
      <div className="dash-nav-row">
        <Link to="/orders" className="dash-nav-card">
          <ShoppingBag size={20} />
          <span>Заказы</span>
        </Link>
        <Link to="/finance" className="dash-nav-card">
          <TrendingUp size={20} />
          <span>Финансы</span>
        </Link>
        <Link to="/customers" className="dash-nav-card">
          <Users size={20} />
          <span>Покупатели</span>
        </Link>
        <Link to="/analytics" className="dash-nav-card">
          <Store size={20} />
          <span>Аналитика</span>
        </Link>
      </div>
    </div>
  );
}
