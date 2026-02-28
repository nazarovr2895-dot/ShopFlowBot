import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Package, Users, Store, ClipboardCheck, ShoppingBag, Settings as SettingsIcon, BarChart3, XCircle, CreditCard, Calendar, CheckCircle2 } from 'lucide-react';
import { getMe, getStats, getOrders, getDashboardAlerts, getSubscriberCount, getUpcomingEvents, getDashboardOrderEvents } from '../../api/sellerClient';
import type { SellerMe, SellerStats, DashboardAlerts, UpcomingEvent, OrderEvent } from '../../api/sellerClient';
import { useSellerAuth } from '../../contexts/SellerAuthContext';
import { PageHeader, StatCard, StatusBadge, Card, ActionCard } from '@shared/components/ui';
import { MiniSparkline } from '../../components/MiniSparkline';
import '../Dashboard.css';

const PENDING_POLL_INTERVAL_MS = 45 * 1000;
const NOTIFICATION_TITLE = 'flurai';

const CURRENCY = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
function fmtCurrency(v: number) { return `${CURRENCY.format(v)} ₽`; }

function TrendBadge({ current, previous }: { current: number; previous: number | undefined }) {
  if (previous == null || previous === 0) return null;
  const diff = ((current - previous) / previous) * 100;
  const abs = Math.abs(Math.round(diff));
  if (abs === 0) return null;
  const variant = diff > 0 ? 'up' : 'down';
  const arrow = diff > 0 ? '↑' : '↓';
  return <span className={`trend-badge trend-badge--${variant}`}>{arrow} {abs}%</span>;
}

export function SellerDashboard() {
  const { isPrimary, isNetwork, branches } = useSellerAuth();
  const [me, setMe] = useState<SellerMe | null>(null);
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [weekStats, setWeekStats] = useState<SellerStats | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [alerts, setAlerts] = useState<DashboardAlerts | null>(null);
  const [orderEvents, setOrderEvents] = useState<OrderEvent[]>([]);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [branch, setBranch] = useState<string>('all');
  const lastPendingCountRef = useRef<number | null>(null);

  const showBranchFilter = isPrimary && isNetwork;

  useEffect(() => {
    const branchParam = showBranchFilter ? branch : undefined;
    const load = async () => {
      try {
        const [meData, statsData, weekStatsData, pendingOrders, activeOrders, alertsData, subCount, eventsData, orderEventsData] = await Promise.all([
          getMe(),
          getStats({ branch: branchParam }),
          getStats({ period: '7d', branch: branchParam }),
          getOrders({ status: 'pending' }),
          getOrders({ status: 'accepted,assembling,in_transit,ready_for_pickup' }),
          getDashboardAlerts(),
          getSubscriberCount().catch(() => ({ count: 0 })),
          getUpcomingEvents(14).catch(() => []),
          getDashboardOrderEvents().catch(() => ({ events: [] })),
        ]);
        setMe(meData);
        setStats(statsData);
        setWeekStats(weekStatsData);
        const pending = pendingOrders?.length ?? 0;
        setPendingCount(pending);
        lastPendingCountRef.current = pending;
        setActiveCount(activeOrders?.length ?? 0);
        setAlerts(alertsData);
        setOrderEvents(orderEventsData.events || []);
        setSubscriberCount(subCount.count);
        setUpcomingEvents(eventsData);
      } catch {
        setMe(null);
        setStats(null);
        setWeekStats(null);
        setAlerts(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [branch, showBranchFilter]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const tick = async () => {
      try {
        const pendingOrders = await getOrders({ status: 'pending' });
        const count = pendingOrders?.length ?? 0;
        const prev = lastPendingCountRef.current;
        const isHidden = document.visibilityState === 'hidden';
        if (isHidden && prev !== null && count > prev && Notification.permission === 'granted') {
          const text = count - prev === 1
            ? 'Новый запрос на покупку'
            : `Новых запросов на покупку: ${count - prev}`;
          new Notification(NOTIFICATION_TITLE, { body: text });
        }
        lastPendingCountRef.current = count;
        setPendingCount(count);
      } catch {
        // ignore poll errors
      }
    };
    const id = setInterval(tick, PENDING_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loader" />
      </div>
    );
  }

  const hasAlerts = (alerts?.low_stock_bouquets?.length ?? 0) + (alerts?.expiring_items?.length ?? 0) > 0;

  const commissionRate = stats?.commission_rate ?? 3;
  const weekRevenue = weekStats?.total_revenue ?? 0;
  const weekNetRevenue = weekStats?.net_revenue ?? 0;
  const sparklineData = weekStats?.daily_sales?.map((d) => ({ date: d.date, revenue: d.revenue })) ?? [];

  return (
    <div className="dashboard">
      <PageHeader
        title="Дашборд"
        subtitle={me?.shop_name || 'Мой магазин'}
        actions={showBranchFilter ? (
          <select
            className="form-input form-input-sm"
            value={branch}
            onChange={(e) => { setBranch(e.target.value); setLoading(true); }}
            style={{ minWidth: 160 }}
          >
            <option value="all">Все филиалы</option>
            {branches.map((b) => (
              <option key={b.seller_id} value={String(b.seller_id)}>
                {b.shop_name || `Филиал #${b.seller_id}`}
              </option>
            ))}
          </select>
        ) : undefined}
      />

      {/* ── Hero Row ──────────────────────────── */}
      <div className="dashboard-hero-row">
        <div className="dashboard-hero-card dashboard-hero-card--accent">
          <div className="dashboard-hero-content">
            <span className="dashboard-hero-label">Выручка за 7 дней</span>
            <span className="dashboard-hero-value">{fmtCurrency(weekRevenue)}</span>
            <TrendBadge current={weekRevenue} previous={weekStats?.previous_period_revenue} />
          </div>
          {sparklineData.length >= 2 && (
            <MiniSparkline data={sparklineData} width={160} height={48} />
          )}
        </div>
        <div className="dashboard-hero-card">
          <div className="dashboard-hero-content">
            <span className="dashboard-hero-label">К получению (−{commissionRate}%)</span>
            <span className="dashboard-hero-value">{fmtCurrency(weekNetRevenue)}</span>
          </div>
          <div className="dashboard-hero-secondary">
            <span className="dashboard-hero-orders">
              {weekStats?.total_completed_orders ?? 0} {pluralOrders(weekStats?.total_completed_orders ?? 0)}
            </span>
            <TrendBadge current={weekStats?.total_completed_orders ?? 0} previous={weekStats?.previous_period_orders} />
          </div>
        </div>
      </div>

      {/* ── Alerts ──────────────────────────────── */}
      {hasAlerts && (
        <Card className="dashboard-alerts-card">
          <div className="dashboard-alerts-header">
            <AlertTriangle size={18} />
            <h3>Внимание</h3>
          </div>
          {alerts?.low_stock_bouquets?.length ? (
            <p className="dashboard-alert-text">
              <StatusBadge variant="warning" size="sm">Низкий остаток</StatusBadge>{' '}
              {alerts.low_stock_bouquets.map((b) => (
                <Link key={b.id} to="/catalog?tab=bouquets" className="dashboard-alert-link">
                  {b.name} (можно собрать: {b.can_assemble_count})
                </Link>
              )).reduce((prev, curr, i) => (i === 0 ? [curr] : [...prev, ', ', curr]) as React.ReactNode[], [] as React.ReactNode[])}
            </p>
          ) : null}
          {alerts?.expiring_items?.length ? (
            <p className="dashboard-alert-text">
              <StatusBadge variant="danger" size="sm">Истекает срок</StatusBadge>{' '}
              {alerts.expiring_items.slice(0, 5).map((e, i) => (
                <span key={i}>{e.flower_name} в «{e.reception_name}» ({e.days_left} дн.)</span>
              )).reduce((prev, curr, i) => (i === 0 ? [curr] : [...prev, ', ', curr]) as React.ReactNode[], [] as React.ReactNode[])}
              {' '}<Link to="/stock?tab=receptions" className="dashboard-alert-link">→ Приёмка</Link>
            </p>
          ) : null}
        </Card>
      )}

      {/* ── Order Events ────────────────────────── */}
      {orderEvents.length > 0 && (
        <Card className="dashboard-events-card">
          <h3 className="dashboard-section-title">События по заказам</h3>
          <div className="dashboard-order-events-list">
            {orderEvents.map((ev, i) => (
              <Link
                key={`${ev.type}-${ev.order_id}-${i}`}
                to={`/orders/${ev.order_id}`}
                className={`sd-event-item sd-event-item--${ev.type === 'cancelled' ? 'danger' : ev.type === 'payment_failed' ? 'warning' : ev.type === 'preorder_due' ? 'info' : 'success'}`}
              >
                <span className="sd-event-icon">
                  {ev.type === 'cancelled' && <XCircle size={16} />}
                  {ev.type === 'payment_failed' && <CreditCard size={16} />}
                  {ev.type === 'preorder_due' && <Calendar size={16} />}
                  {ev.type === 'completed' && <CheckCircle2 size={16} />}
                </span>
                <div className="sd-event-body">
                  <div className="sd-event-text">
                    {ev.type === 'cancelled' && `Заказ #${ev.order_id} отменён`}
                    {ev.type === 'payment_failed' && `Заказ #${ev.order_id} — оплата не прошла`}
                    {ev.type === 'preorder_due' && `Предзаказ #${ev.order_id} — ${ev.is_today ? 'сегодня' : 'завтра'}`}
                    {ev.type === 'completed' && `Заказ #${ev.order_id} завершён`}
                  </div>
                  <div className="sd-event-sub">
                    {ev.buyer_name || ''}
                    {ev.type === 'payment_failed' && ev.minutes_since_accepted != null && ` · ${Math.round(ev.minutes_since_accepted / 60)} ч назад`}
                  </div>
                </div>
                <span className="sd-event-amount">{fmtCurrency(ev.amount)}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* ── Upcoming Events ────────────────────── */}
      {upcomingEvents.length > 0 && (
        <Card className="dashboard-events-card">
          <h3 className="dashboard-section-title">Предстоящие события клиентов</h3>
          <div className="dashboard-events-list">
            {upcomingEvents.map((ev, i) => (
              <Link key={i} to={`/customers/${ev.customer_id}`} className="dashboard-event-row">
                <span className="dashboard-event-icon">{ev.type === 'birthday' ? '🎂' : '📅'}</span>
                <span className="dashboard-event-body">
                  <strong>{ev.customer_name}</strong> — {ev.title}
                </span>
                {ev.days_until === 0 && <StatusBadge variant="danger" size="sm">Сегодня</StatusBadge>}
                {ev.days_until === 1 && <StatusBadge variant="warning" size="sm">Завтра</StatusBadge>}
                {ev.days_until > 1 && <StatusBadge variant="neutral" size="sm">через {ev.days_until} дн.</StatusBadge>}
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* ── Quick Actions ──────────────────────── */}
      <div className="dashboard-quick-actions">
        <Link to="/stock?tab=receptions" className="btn btn-primary"><Package size={16} /> Приёмка</Link>
        <Link to="/customers" className="btn btn-secondary"><Users size={16} /> Клиенты</Link>
        <Link to="/catalog" className="btn btn-secondary"><Store size={16} /> Витрина</Link>
        <Link to="/stock?tab=inventory" className="btn btn-secondary"><ClipboardCheck size={16} /> Инвентаризация</Link>
      </div>

      {/* ── Stats Grid ─────────────────────────── */}
      <div className="dashboard-stats-grid">
        <StatCard label="Запросы на покупку" value={pendingCount} link={{ to: '/orders?tab=pending', label: 'Перейти' }} />
        <StatCard label="Активные заказы" value={activeCount} link={{ to: '/orders?tab=active', label: 'Перейти' }} />
        <StatCard label="Выполнено (всё время)" value={stats?.total_completed_orders ?? 0} />
        <StatCard label="Выручка (всё время)" value={fmtCurrency(stats?.total_revenue ?? 0)} />
        {me && (
          <StatCard
            label="В работе / лимит"
            value={me.limit_set_for_today ? `${me.orders_used_today ?? 0} / ${me.max_orders ?? 0}` : 'Не задан'}
          />
        )}
        <StatCard label="Подписчики" value={subscriberCount} link={{ to: '/customers?tab=subscribers', label: 'Перейти' }} />
      </div>

      {/* ── Navigation Cards ───────────────────── */}
      <div className="dashboard-nav-grid">
        <ActionCard to="/orders" icon={<ShoppingBag size={20} />} title="Заказы" description="Запросы, активные заказы и история" />
        <ActionCard to="/settings" icon={<SettingsIcon size={20} />} title="Настройки магазина" description="Лимиты, ссылка, расписание" />
        <ActionCard to="/analytics" icon={<BarChart3 size={20} />} title="Статистика продаж" description="Детальная аналитика по выручке" />
      </div>
    </div>
  );
}

function pluralOrders(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return 'заказов';
  if (last > 1 && last < 5) return 'заказа';
  if (last === 1) return 'заказ';
  return 'заказов';
}
